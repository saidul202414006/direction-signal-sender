/*
 * RX Receiver Firmware — ESP32-S3
 * WiFi CSI Zone Detection Project
 *
 * Based on official Espressif esp-csi/examples/get-started/csi_recv
 * Source: https://github.com/espressif/esp-csi/tree/master/examples/get-started/csi_recv
 *
 * Role: Receives ESP-NOW packets from TX, extracts CSI data, streams over USB-serial as CSV.
 *
 * ARCHITECTURE (mandatory per Espressif Wi-Fi driver rules):
 *   - CSI callback: ONLY copies wifi_csi_info_t into FreeRTOS queue, returns immediately.
 *   - Worker task: reads queue, formats CSV line, writes to UART.
 *   - Heavy processing or blocking inside the CSI callback is FORBIDDEN.
 *
 * CSV OUTPUT FORMAT (one line per CSI packet):
 *   NODE_ID,timestamp_ms,rssi,noise_floor,subcarrier_count,imag0,real0,imag1,real1,...
 *
 * LED PATTERNS (GPIO 2):
 *   RX activity: toggles every 10 CSI packets received (~5Hz visible blink at 100pkt/s)
 *   Startup: 3 rapid blinks then goes to normal activity mode
 *
 * BAUD RATE: 921600 (set in sdkconfig.defaults — required for 100Hz×1KB stream)
 *
 * IMPORTANT DEVIATIONS FROM OFFICIAL EXAMPLE:
 *   - Bandwidth overridden to HT20 (official default is HT40).
 *   - Channel hardcoded to CONFIG_WIFI_CHANNEL (6).
 *   - NODE_ID is prepended to every CSV line.
 *   - LED on GPIO 2 for visual activity indication.
 *   - vTaskDelay(1) in worker loop to prevent Task WDT starvation.
 *   - Amplitude stats printed every 100 packets for live hand-movement verification.
 */

#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <math.h>

#include "nvs_flash.h"
#include "esp_mac.h"
#include "esp_log.h"
#include "esp_wifi.h"
#include "esp_netif.h"
#include "esp_now.h"
#include "esp_timer.h"
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"

/* ─── Configuration (set via platformio.ini build_flags) ─────────────────── */
#ifndef CONFIG_WIFI_CHANNEL
#define CONFIG_WIFI_CHANNEL         6
#endif

#ifndef CONFIG_NODE_ID
#define CONFIG_NODE_ID              "RX_UNKNOWN"
#endif

/* MAC address of the TX broadcaster — must match tx_broadcaster firmware */
static const uint8_t CONFIG_CSI_SEND_MAC[6] = {
    CONFIG_CSI_SEND_MAC_0, CONFIG_CSI_SEND_MAC_1, CONFIG_CSI_SEND_MAC_2,
    CONFIG_CSI_SEND_MAC_3, CONFIG_CSI_SEND_MAC_4, CONFIG_CSI_SEND_MAC_5
};

/* Physical hardware MAC of ESP32-S3 TX board (backup match) */
static const uint8_t HARDWARE_TX_S3_MAC[6] = {0x10, 0x51, 0xdb, 0x85, 0xfe, 0xb8};
static const uint8_t BROADCAST_MAC[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

/* ─── LED Configuration ───────────────────────────────────────────────────── */
/*
 * GPIO 2 is used as LED output.
 * On ESP32-S3 DevKitC-1: GPIO 2 is a general-purpose IO.
 * If your board has a different LED pin, change LED_GPIO here.
 * LED blink pattern: toggles every 10 received CSI packets (~5Hz visible blink).
 */
#define LED_GPIO                    GPIO_NUM_2

/* ─── CSI Queue Configuration ─────────────────────────────────────────────── */
/*
 * Queue size: enough to buffer ~1s of CSI at 100Hz (100 items) without dropping.
 * Worker task yield ensures IDLE gets CPU time, preventing WDT starvation.
 */
#define CSI_QUEUE_SIZE              100
#define CSI_MAX_SUBCARRIERS         128   /* HT20 gives 52 data + pilot; 128 covers all */

/* Struct stored in queue — copy of CSI info (we cannot hold the pointer past callback) */
typedef struct {
    uint64_t timestamp_us;      /* esp_timer_get_time() at callback entry */
    int8_t   rssi;
    int8_t   noise_floor;
    uint16_t subcarrier_count;  /* number of valid int8 pairs in buf */
    int8_t   buf[CSI_MAX_SUBCARRIERS * 2]; /* interleaved: imag0, real0, imag1, real1... */
} csi_record_t;

static QueueHandle_t s_csi_queue = NULL;
static const char *TAG = "csi_recv";

static volatile uint32_t s_total_cb_calls   = 0;
static volatile uint32_t s_matched_cb_calls = 0;
static uint8_t           s_last_mac[6]      = {0};

/* ─── LED Helper ──────────────────────────────────────────────────────────── */
static void led_init(void)
{
    gpio_reset_pin(LED_GPIO);
    gpio_set_direction(LED_GPIO, GPIO_MODE_OUTPUT);
    gpio_set_level(LED_GPIO, 0);
}

static inline void led_set(int level)
{
    gpio_set_level(LED_GPIO, level);
}

/* Startup sequence: 3 rapid blinks to show firmware is alive */
static void led_startup_blink(void)
{
    for (int i = 0; i < 3; i++) {
        led_set(1); vTaskDelay(pdMS_TO_TICKS(100));
        led_set(0); vTaskDelay(pdMS_TO_TICKS(100));
    }
}

/* ─── CSI Callback (Wi-Fi driver context — MUST be fast) ─────────────────── */
/*
 * Per Espressif Wi-Fi driver docs: do NOT print, allocate heap, or block here.
 * Only copy the record into the queue and return.
 */
static void csi_callback(void *ctx, wifi_csi_info_t *info)
{
    if (!info || !info->buf) return;
    s_total_cb_calls++;
    memcpy(s_last_mac, info->mac, 6);

    /* Filter: ONLY accept CSI packets originating from our TX broadcaster MAC */
    if (memcmp(info->mac, CONFIG_CSI_SEND_MAC, 6) != 0 &&
        memcmp(info->mac, HARDWARE_TX_S3_MAC, 6) != 0) {
        return;
    }
    s_matched_cb_calls++;

    csi_record_t record;
    record.timestamp_us   = esp_timer_get_time();
    record.rssi           = info->rx_ctrl.rssi;
    record.noise_floor    = info->rx_ctrl.noise_floor;

    /* Clamp subcarrier count to our buffer size */
    uint16_t count = (uint16_t)(info->len);
    if (count > CSI_MAX_SUBCARRIERS * 2) count = CSI_MAX_SUBCARRIERS * 2;
    record.subcarrier_count = count / 2;  /* pairs */

    memcpy(record.buf, info->buf, count);

    /* Non-blocking send — if queue is full, drop this packet */
    BaseType_t higher_prio_woken = pdFALSE;
    xQueueSendFromISR(s_csi_queue, &record, &higher_prio_woken);
    portYIELD_FROM_ISR(higher_prio_woken);
}

/* ─── Worker Task (reads queue, formats CSV, outputs via UART/USB-serial) ── */
static void csi_worker_task(void *pvParameter)
{
    csi_record_t record;
    uint32_t packet_count  = 0;
    uint32_t dropped_count = 0;
    uint32_t led_toggle_count = 0;

    /* Amplitude stats for hand-movement verification */
    float    amp_sum_window  = 0.0f;
    uint32_t amp_count_window = 0;
    float    amp_min_window  = 1e9f;
    float    amp_max_window  = 0.0f;

    /* Pre-allocate output buffer:
     * NODE_ID(10) + ts(20) + rssi(6) + nf(6) + count(6) +
     * 128 subcarrier pairs × ~6 chars each + separators = ~1600 bytes max */
    static char line_buf[2048];

    ESP_LOGI(TAG, "CSI worker task started. Waiting for packets...");

    while (true) {
        if (xQueueReceive(s_csi_queue, &record, pdMS_TO_TICKS(1000)) != pdTRUE) {
            /* 1s timeout: print diagnostic when waiting for packets */
            ESP_LOGI(TAG, "Waiting for CSI... [CB=%lu, Matched=%lu, LastMAC=%02x:%02x:%02x:%02x:%02x:%02x]",
                     s_total_cb_calls, s_matched_cb_calls,
                     s_last_mac[0], s_last_mac[1], s_last_mac[2],
                     s_last_mac[3], s_last_mac[4], s_last_mac[5]);
            /* Blink LED rapidly when waiting (no signal) */
            led_set((xTaskGetTickCount() / pdMS_TO_TICKS(250)) % 2);
            continue;
        }

        packet_count++;

        /* ── LED blink: toggle every 10 packets (~5Hz visible blink at 100pkt/s) ── */
        led_toggle_count++;
        if (led_toggle_count % 10 == 0) {
            led_set((led_toggle_count / 10) % 2);
        }

        /* ── Amplitude statistics for live hand-movement verification ── */
        /* Compute mean amplitude across non-zero subcarrier pairs */
        {
            float packet_amp_sum = 0.0f;
            int   valid_subs = 0;
            for (uint16_t i = 0; i < record.subcarrier_count; i++) {
                int8_t im = record.buf[i * 2];
                int8_t re = record.buf[i * 2 + 1];
                if (im == 0 && re == 0) continue;  /* skip null subcarriers */
                float amp = sqrtf((float)im * im + (float)re * re);
                packet_amp_sum += amp;
                if (amp < amp_min_window) amp_min_window = amp;
                if (amp > amp_max_window) amp_max_window = amp;
                valid_subs++;
            }
            if (valid_subs > 0) {
                amp_sum_window += packet_amp_sum / valid_subs;
                amp_count_window++;
            }
        }

        /* ── Build CSV line: NODE_ID,timestamp_ms,rssi,noise_floor,count,imag0,real0,... ── */
        int pos = 0;
        pos += snprintf(line_buf + pos, sizeof(line_buf) - pos,
                        "%s,%llu,%d,%d,%u",
                        CONFIG_NODE_ID,
                        (unsigned long long)(record.timestamp_us / 1000ULL),
                        (int)record.rssi,
                        (int)record.noise_floor,
                        (unsigned int)record.subcarrier_count);

        for (uint16_t i = 0; i < record.subcarrier_count * 2; i++) {
            if (pos < (int)sizeof(line_buf) - 8) {
                pos += snprintf(line_buf + pos, sizeof(line_buf) - pos,
                                ",%d", (int)record.buf[i]);
            }
        }

        if (pos < (int)sizeof(line_buf) - 2) {
            line_buf[pos++] = '\n';
            line_buf[pos]   = '\0';
        }

        /* Write to stdout → USB-serial (921600 baud) */
        printf("%s", line_buf);

        /* ── CRITICAL: delay to let IDLE task run and prevent Task WDT starvation ── */
        /* taskYIELD() only yields to same priority; vTaskDelay blocks and lets priority 0 run. */
        vTaskDelay(1);

        /* ── Print amplitude stats every 100 packets for hand-movement feedback ── */
        if (packet_count % 100 == 0) {
            float amp_avg = (amp_count_window > 0) ? (amp_sum_window / amp_count_window) : 0.0f;
            ESP_LOGI(TAG, "--- STATS [%lu pkts] RSSI=%ddBm AMP_avg=%.1f AMP_min=%.1f AMP_max=%.1f | Wave your hand to see changes! ---",
                     packet_count, (int)record.rssi, amp_avg, amp_min_window, amp_max_window);
            /* Reset window stats */
            amp_sum_window   = 0.0f;
            amp_count_window = 0;
            amp_min_window   = 1e9f;
            amp_max_window   = 0.0f;
        }
    }
}

/* ─── Wi-Fi Initialisation ───────────────────────────────────────────────── */
static void wifi_init(void)
{
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    ESP_ERROR_CHECK(esp_netif_init());

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    cfg.csi_enable = 1;
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_storage(WIFI_STORAGE_RAM));
    ESP_ERROR_CHECK(esp_wifi_start());

    /* Fix channel — must match TX exactly */
    ESP_ERROR_CHECK(esp_wifi_set_channel(CONFIG_WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE));

    /* Override bandwidth to HT20 — must match TX */
    ESP_ERROR_CHECK(esp_wifi_set_bandwidth(WIFI_IF_STA, WIFI_BW20));

    /* Disable power saving for continuous reception */
    ESP_ERROR_CHECK(esp_wifi_set_ps(WIFI_PS_NONE));

    ESP_LOGI(TAG, "Wi-Fi STA started. Node: %s | Channel: %d | BW: HT20",
             CONFIG_NODE_ID, CONFIG_WIFI_CHANNEL);
}

/* ─── ESP-NOW + CSI Initialisation ──────────────────────────────────────── */
static void espnow_csi_init(void)
{
    /* Initialise ESP-NOW */
    ESP_ERROR_CHECK(esp_now_init());
    ESP_ERROR_CHECK(esp_now_set_pmk((uint8_t *)"pmk1234567890123"));

    /* Register TX node peers so we receive its data */
    esp_now_peer_info_t peer_info = {
        .channel  = CONFIG_WIFI_CHANNEL,
        .ifidx    = WIFI_IF_STA,
        .encrypt  = false,
    };
    memcpy(peer_info.peer_addr, CONFIG_CSI_SEND_MAC, 6);
    esp_now_add_peer(&peer_info);

    /* Also register the hardware MAC of the TX board */
    memcpy(peer_info.peer_addr, HARDWARE_TX_S3_MAC, 6);
    esp_now_add_peer(&peer_info);

    /* Broadcast peer */
    memcpy(peer_info.peer_addr, BROADCAST_MAC, 6);
    esp_now_add_peer(&peer_info);

    /* Enable promiscuous mode (required before CSI config) */
    ESP_ERROR_CHECK(esp_wifi_set_promiscuous(true));

    /* All frame types — needed to capture ESP-NOW ACTION frames */
    wifi_promiscuous_filter_t filter = {
        .filter_mask = WIFI_PROMIS_FILTER_MASK_ALL
    };
    ESP_ERROR_CHECK(esp_wifi_set_promiscuous_filter(&filter));

    /* Re-lock channel after entering promiscuous mode */
    ESP_ERROR_CHECK(esp_wifi_set_channel(CONFIG_WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE));

    /*
     * Configure CSI:
     * - lltf_en: Legacy LTF — most stable, always present in HT packets
     * - htltf_en: HT LTF — additional subcarriers (from HT20 MCS0 packets)
     * - stbc_htltf2_en: STBC second HT LTF
     * - ltf_merge_en: merge all LTF contributions
     * - channel_filter_en: hardware channel filter
     */
    wifi_csi_config_t csi_config = {
        .lltf_en           = true,
        .htltf_en          = true,
        .stbc_htltf2_en    = true,
        .ltf_merge_en      = true,
        .channel_filter_en = true,
        .manu_scale        = false,
        .shift             = 0,
        .dump_ack_en       = false,
    };
    ESP_ERROR_CHECK(esp_wifi_set_csi_config(&csi_config));

    /* Register CSI callback — runs in Wi-Fi driver context, MUST be fast */
    ESP_ERROR_CHECK(esp_wifi_set_csi_rx_cb(csi_callback, NULL));

    /* Enable CSI reception */
    ESP_ERROR_CHECK(esp_wifi_set_csi(true));

    ESP_LOGI(TAG, "ESP-NOW + CSI enabled. Filtering on TX MAC %02x:%02x:%02x:%02x:%02x:%02x (or %02x:%02x:%02x:%02x:%02x:%02x)",
             CONFIG_CSI_SEND_MAC[0], CONFIG_CSI_SEND_MAC[1], CONFIG_CSI_SEND_MAC[2],
             CONFIG_CSI_SEND_MAC[3], CONFIG_CSI_SEND_MAC[4], CONFIG_CSI_SEND_MAC[5],
             HARDWARE_TX_S3_MAC[0], HARDWARE_TX_S3_MAC[1], HARDWARE_TX_S3_MAC[2],
             HARDWARE_TX_S3_MAC[3], HARDWARE_TX_S3_MAC[4], HARDWARE_TX_S3_MAC[5]);
}

/* ─── Entry Point ─────────────────────────────────────────────────────────── */
void app_main(void)
{
    /* NVS required by Wi-Fi driver */
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    /* LED init — 3 rapid blinks to confirm firmware is alive */
    led_init();
    led_startup_blink();

    /* Create CSI queue BEFORE enabling Wi-Fi (callback may fire during init) */
    s_csi_queue = xQueueCreate(CSI_QUEUE_SIZE, sizeof(csi_record_t));
    if (s_csi_queue == NULL) {
        ESP_LOGE(TAG, "FATAL: Failed to create CSI queue. Halting.");
        vTaskDelete(NULL);
        return;
    }

    wifi_init();
    espnow_csi_init();

    /*
     * Worker task: pinned to Core 1 (Wi-Fi on Core 0).
     * Priority 3 — below Wi-Fi driver (typically 23) but above IDLE.
     * Stack 8192 — generous for CSV formatting.
     * CRITICAL: task includes vTaskDelay(1) / taskYIELD() to prevent WDT.
     */
    xTaskCreatePinnedToCore(
        csi_worker_task,
        "csi_worker",
        8192,
        NULL,
        3,      /* Priority */
        NULL,
        1       /* Core 1 */
    );

    ESP_LOGI(TAG, "========================================");
    ESP_LOGI(TAG, "RX Receiver: %s | CH %d | HT20 | 921600 baud", CONFIG_NODE_ID, CONFIG_WIFI_CHANNEL);
    ESP_LOGI(TAG, "LED GPIO %d: blinks every 10 CSI packets (~5Hz when receiving at 100pkt/s)", LED_GPIO);
    ESP_LOGI(TAG, "CSV: NODE_ID,ts_ms,rssi,noise_floor,subcr_count,imag0,real0,...");
    ESP_LOGI(TAG, "STATS: amplitude avg/min/max printed every 100 pkts — wave hand to see changes!");
    ESP_LOGI(TAG, "========================================");
}
