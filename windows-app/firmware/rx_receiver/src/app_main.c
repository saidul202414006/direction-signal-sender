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
#include "esp_event.h"
#include "esp_now.h"
#include "esp_timer.h"
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"

#include "lwip/err.h"
#include "lwip/sockets.h"
#include "lwip/sys.h"
#include <lwip/netdb.h>

#define HOTSPOT_SSID        "MMA"
#define HOTSPOT_PASS        "mma151688"
#define UDP_TARGET_PORT     5555

static int s_udp_sock = -1;
static struct sockaddr_in s_udp_dest_addr;
static struct sockaddr_in s_udp_subnet_addr;
static volatile bool s_has_subnet_addr = false;
static volatile bool s_wifi_connected = false;
static volatile uint32_t s_rx_packet_count = 0;

/* ─── Configuration (set via platformio.ini build_flags) ─────────────────── */
#ifndef CONFIG_WIFI_CHANNEL
#define CONFIG_WIFI_CHANNEL         2
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
/* Physical hardware MAC of ESP32 DevKit V1 TX board (COM7) */
static const uint8_t HARDWARE_TX_DEVKIT_MAC[6] = {0x84, 0x1f, 0xe8, 0x1b, 0x5f, 0x78};
static const uint8_t BROADCAST_MAC[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

/* ─── LED Configuration ───────────────────────────────────────────────────── */
#define LED_GPIO                    GPIO_NUM_2

/* ─── CSI Queue Configuration ─────────────────────────────────────────────── */
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

/* Candidate LED pins covering ESP32-S3 and AM-036 (TTGO T-Call GPIO 13) & clones */
static const gpio_num_t CANDIDATE_LEDS[] = {
#if CONFIG_IDF_TARGET_ESP32S3
    GPIO_NUM_2, GPIO_NUM_48, GPIO_NUM_38, GPIO_NUM_21, GPIO_NUM_1
#else
    GPIO_NUM_13, GPIO_NUM_2, GPIO_NUM_4, GPIO_NUM_5, GPIO_NUM_12,
    GPIO_NUM_14, GPIO_NUM_15, GPIO_NUM_16, GPIO_NUM_21, GPIO_NUM_22,
    GPIO_NUM_23, GPIO_NUM_25, GPIO_NUM_27, GPIO_NUM_32, GPIO_NUM_33
#endif
};
#define NUM_LEDS (sizeof(CANDIDATE_LEDS) / sizeof(CANDIDATE_LEDS[0]))

/* ─── LED Helper ──────────────────────────────────────────────────────────── */
static void led_init(void)
{
    gpio_config_t io_conf = {
        .mode = GPIO_MODE_OUTPUT,
        .intr_type = GPIO_INTR_DISABLE,
        .pin_bit_mask = 0,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .pull_up_en = GPIO_PULLUP_DISABLE,
    };
    for (size_t i = 0; i < NUM_LEDS; i++) {
        io_conf.pin_bit_mask |= (1ULL << CANDIDATE_LEDS[i]);
    }
    gpio_config(&io_conf);
    for (size_t i = 0; i < NUM_LEDS; i++) {
        gpio_set_level(CANDIDATE_LEDS[i], 0);
    }
}

static inline void led_set(int level)
{
    for (size_t i = 0; i < NUM_LEDS; i++) {
        gpio_set_level(CANDIDATE_LEDS[i], level);
    }
}

/* Startup sequence: 3 rapid blinks to show firmware is alive */
static void led_startup_blink(void)
{
    for (int i = 0; i < 3; i++) {
        led_set(1); vTaskDelay(pdMS_TO_TICKS(100));
        led_set(0); vTaskDelay(pdMS_TO_TICKS(100));
    }
}

/* Dedicated continuous LED blink task pinned to Core 1:
 * - 2Hz heartbeat (250ms ON, 250ms OFF) when idle/waiting
 * - 10Hz rapid blink (50ms ON, 50ms OFF) when actively receiving CSI packets
 */
static void led_blink_task(void *pvParameter)
{
    uint32_t last_count = 0;
    while (1) {
        bool receiving = (s_rx_packet_count != last_count);
        last_count = s_rx_packet_count;

        if (receiving) {
            led_set(1);
            vTaskDelay(pdMS_TO_TICKS(50));
            led_set(0);
            vTaskDelay(pdMS_TO_TICKS(50));
        } else {
            led_set(1);
            vTaskDelay(pdMS_TO_TICKS(250));
            led_set(0);
            vTaskDelay(pdMS_TO_TICKS(250));
        }
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
        memcmp(info->mac, HARDWARE_TX_S3_MAC, 6) != 0 &&
        memcmp(info->mac, HARDWARE_TX_DEVKIT_MAC, 6) != 0) {
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
            continue;
        }

        packet_count++;
        s_rx_packet_count = packet_count;

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

        /* Write to UDP broadcast over Wi-Fi Hotspot (Global + Subnet) */
        if (s_wifi_connected && s_udp_sock >= 0) {
            sendto(s_udp_sock, line_buf, strlen(line_buf), 0,
                   (struct sockaddr *)&s_udp_dest_addr, sizeof(s_udp_dest_addr));
            if (s_has_subnet_addr) {
                sendto(s_udp_sock, line_buf, strlen(line_buf), 0,
                       (struct sockaddr *)&s_udp_subnet_addr, sizeof(s_udp_subnet_addr));
            }
        }

        /* ── CRITICAL: delay to let IDLE task run and prevent Task WDT starvation ── */
        /* taskYIELD() only yields to same priority; vTaskDelay blocks and lets priority 0 run. */
        vTaskDelay(1);

        /* ── Print amplitude stats every 100 packets for hand-movement feedback ── */
        if (packet_count % 100 == 0) {
            float amp_avg = (amp_count_window > 0) ? (amp_sum_window / amp_count_window) : 0.0f;
            ESP_LOGI(TAG, "--- STATS [%lu pkts] RSSI=%ddBm AMP_avg=%.1f AMP_min=%.1f AMP_max=%.1f | Hotspot=%s ---",
                     packet_count, (int)record.rssi, amp_avg, amp_min_window, amp_max_window,
                     s_wifi_connected ? "ONLINE" : "CONNECTING");
            /* Reset window stats */
            amp_sum_window   = 0.0f;
            amp_count_window = 0;
            amp_min_window   = 1e9f;
            amp_max_window   = 0.0f;
        }
    }
}

/* ─── Wi-Fi Event Handler ─────────────────────────────────────────────────── */
static void wifi_event_handler(void* arg, esp_event_base_t event_base,
                               int32_t event_id, void* event_data)
{
    if (event_base == WIFI_EVENT) {
        if (event_id == WIFI_EVENT_STA_START) {
            ESP_LOGI(TAG, "Wi-Fi STA started. Connecting to '%s'...", HOTSPOT_SSID);
            esp_wifi_connect();
        } else if (event_id == WIFI_EVENT_STA_CONNECTED) {
            ESP_LOGI(TAG, "Connected to '%s'! Waiting for IP...", HOTSPOT_SSID);
        } else if (event_id == WIFI_EVENT_STA_DISCONNECTED) {
            wifi_event_sta_disconnected_t *disconn = (wifi_event_sta_disconnected_t *)event_data;
            ESP_LOGW(TAG, "Wi-Fi disconnected from '%s', reason=%d, retrying...", HOTSPOT_SSID, disconn ? disconn->reason : -1);
            s_wifi_connected = false;
            if (s_udp_sock >= 0) {
                close(s_udp_sock);
                s_udp_sock = -1;
            }
            vTaskDelay(pdMS_TO_TICKS(500));
            esp_wifi_connect();
        } else {
            ESP_LOGI(TAG, "WIFI_EVENT id=%ld", (long)event_id);
        }
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t* event = (ip_event_got_ip_t*) event_data;
        ESP_LOGI(TAG, "[HOTSPOT CONNECTED] IP: " IPSTR, IP2STR(&event->ip_info.ip));

        if (s_udp_sock < 0) {
            s_udp_sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_IP);
            if (s_udp_sock >= 0) {
                int broadcast = 1;
                setsockopt(s_udp_sock, SOL_SOCKET, SO_BROADCAST, &broadcast, sizeof(broadcast));

                /* 1. Global Broadcast 255.255.255.255 */
                memset(&s_udp_dest_addr, 0, sizeof(s_udp_dest_addr));
                s_udp_dest_addr.sin_family = AF_INET;
                s_udp_dest_addr.sin_port = htons(UDP_TARGET_PORT);
                s_udp_dest_addr.sin_addr.s_addr = htonl(INADDR_BROADCAST);

                /* 2. Subnet Broadcast: (ip & netmask) | ~netmask */
                uint32_t ip = event->ip_info.ip.addr;
                uint32_t mask = event->ip_info.netmask.addr;
                uint32_t subnet_bcast = (ip & mask) | (~mask);

                memset(&s_udp_subnet_addr, 0, sizeof(s_udp_subnet_addr));
                s_udp_subnet_addr.sin_family = AF_INET;
                s_udp_subnet_addr.sin_port = htons(UDP_TARGET_PORT);
                s_udp_subnet_addr.sin_addr.s_addr = subnet_bcast;
                s_has_subnet_addr = true;

                s_wifi_connected = true;
                ESP_LOGI(TAG, "[UDP BROADCAST READY] Streaming to 255.255.255.255:%d and Subnet " IPSTR ":%d",
                         UDP_TARGET_PORT, IP2STR((esp_ip4_addr_t*)&subnet_bcast), UDP_TARGET_PORT);

                /* Ensure modem power saving is completely disabled after associating with AP */
                esp_wifi_set_ps(WIFI_PS_NONE);
                esp_wifi_set_csi(true);
                ESP_LOGI(TAG, "PS_NONE & CSI enabled on active channel");
            }
        }
    }
}

/* ─── Wi-Fi Initialisation ───────────────────────────────────────────────── */
static void wifi_init(void)
{
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    ESP_ERROR_CHECK(esp_netif_init());
    esp_netif_create_default_wifi_sta();

    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL, NULL));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL, NULL));

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    cfg.csi_enable = 1;
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    wifi_config_t wifi_config;
    memset(&wifi_config, 0, sizeof(wifi_config));
    strlcpy((char *)wifi_config.sta.ssid, HOTSPOT_SSID, sizeof(wifi_config.sta.ssid));
    strlcpy((char *)wifi_config.sta.password, HOTSPOT_PASS, sizeof(wifi_config.sta.password));
    wifi_config.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;
    wifi_config.sta.pmf_cfg.capable = true;
    wifi_config.sta.pmf_cfg.required = false;

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_set_storage(WIFI_STORAGE_RAM));
    ESP_ERROR_CHECK(esp_wifi_start());

    /* Disable power saving for continuous reception & minimal latency */
    ESP_ERROR_CHECK(esp_wifi_set_ps(WIFI_PS_NONE));

    ESP_LOGI(TAG, "Wi-Fi STA started. Auto-connecting to Hotspot: '%s'", HOTSPOT_SSID);
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

    /* Also register the hardware MAC of the DevKit TX board */
    memcpy(peer_info.peer_addr, HARDWARE_TX_DEVKIT_MAC, 6);
    esp_now_add_peer(&peer_info);

    /* Broadcast peer */
    memcpy(peer_info.peer_addr, BROADCAST_MAC, 6);
    esp_now_add_peer(&peer_info);

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

    /* Dedicated continuous LED blink task */
    xTaskCreatePinnedToCore(
        led_blink_task,
        "led_blink",
        2048,
        NULL,
        1,      /* Priority */
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
