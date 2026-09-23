/*
 * TX Broadcaster Firmware — ESP32-S3 (Permanent TX)
 * WiFi CSI Zone Detection Project
 *
 * Based on official Espressif esp-csi/examples/get-started/csi_send
 * Source: https://github.com/espressif/esp-csi/tree/master/examples/get-started/csi_send
 *
 * Role: Broadcasts ESP-NOW packets at ~100Hz on fixed Channel 6, HT20 bandwidth.
 * No CSI extraction needed on TX. Minimal footprint — dedicated to stable transmission only.
 *
 * LED PATTERNS (GPIO 2):
 *   Startup: 5 rapid blinks (TX blinks more than RX so you can tell them apart)
 *   Activity: toggles every 50 packets (~1Hz blink at 100pkt/s)
 *
 * IMPORTANT DEVIATIONS FROM OFFICIAL EXAMPLE:
 *   - Bandwidth overridden to HT20 (official default is HT40).
 *   - Channel hardcoded to CONFIG_WIFI_CHANNEL (6).
 *   - Send frequency set to CONFIG_SEND_FREQUENCY (100 Hz target).
 *   - esp_now_set_peer_rate_config: WIFI_PHY_MODE_HT20 MCS0 — CRITICAL for CSI.
 *     Default ESP-NOW uses 1Mbps DSSS which produces NO OFDM subcarriers and NO CSI!
 */

#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <unistd.h>

#include "nvs_flash.h"
#include "esp_mac.h"
#include "esp_log.h"
#include "esp_wifi.h"
#include "esp_netif.h"
#include "esp_now.h"
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

/* ─── Configuration (set via platformio.ini build_flags) ─────────────────── */
#ifndef CONFIG_WIFI_CHANNEL
#define CONFIG_WIFI_CHANNEL         6
#endif

#ifndef CONFIG_SEND_FREQUENCY
#define CONFIG_SEND_FREQUENCY       100   /* Hz — target packet rate */
#endif

#ifndef CONFIG_NODE_ID
#define CONFIG_NODE_ID              "TX_01"
#endif

/* Broadcast MAC used by csi_send — all RX nodes filter on this MAC */
static const uint8_t CONFIG_CSI_SEND_MAC[6] = {
    CONFIG_CSI_SEND_MAC_0, CONFIG_CSI_SEND_MAC_1, CONFIG_CSI_SEND_MAC_2,
    CONFIG_CSI_SEND_MAC_3, CONFIG_CSI_SEND_MAC_4, CONFIG_CSI_SEND_MAC_5
};

/* Broadcast target — all 0xFF means every node receives it */
static const uint8_t BROADCAST_MAC[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

static const char *TAG = "csi_send";

/* ─── LED Configuration ───────────────────────────────────────────────────── */
/*
 * TX LED blinks with a DIFFERENT pattern from RX so you can tell them apart:
 * - TX: 5 startup blinks, then 1Hz heartbeat (toggle every 50 packets)
 * - RX: 3 startup blinks, then ~5Hz activity blink (toggle every 10 CSI packets)
 */
#define LED_GPIO                    GPIO_NUM_2

static void led_init(void)
{
    gpio_reset_pin(LED_GPIO);
    gpio_set_direction(LED_GPIO, GPIO_MODE_OUTPUT);
    gpio_set_level(LED_GPIO, 0);
}

/* TX startup: 5 fast blinks (vs RX's 3) — tells you which board is TX */
static void led_startup_blink(void)
{
    for (int i = 0; i < 5; i++) {
        gpio_set_level(LED_GPIO, 1); vTaskDelay(pdMS_TO_TICKS(80));
        gpio_set_level(LED_GPIO, 0); vTaskDelay(pdMS_TO_TICKS(80));
    }
}

/* ─── Wi-Fi Initialisation ───────────────────────────────────────────────── */
static void wifi_init(void)
{
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    ESP_ERROR_CHECK(esp_netif_init());

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_storage(WIFI_STORAGE_RAM));

    /* Set the TX MAC address BEFORE esp_wifi_start (mandatory per ESP-IDF docs) */
    ESP_ERROR_CHECK(esp_wifi_set_mac(WIFI_IF_STA, CONFIG_CSI_SEND_MAC));

    /* Set bandwidth to HT20 BEFORE start */
    ESP_ERROR_CHECK(esp_wifi_set_bandwidth(WIFI_IF_STA, WIFI_BW20));

    ESP_ERROR_CHECK(esp_wifi_start());

    /* Set fixed channel AFTER start */
    ESP_ERROR_CHECK(esp_wifi_set_channel(CONFIG_WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE));

    /* Disable power saving for continuous transmission */
    ESP_ERROR_CHECK(esp_wifi_set_ps(WIFI_PS_NONE));

    ESP_LOGI(TAG, "Wi-Fi STA started. Node: %s | Channel: %d | BW: HT20 | Target rate: %dHz",
             CONFIG_NODE_ID, CONFIG_WIFI_CHANNEL, CONFIG_SEND_FREQUENCY);
}

/* ─── ESP-NOW Initialisation ─────────────────────────────────────────────── */
static void espnow_init(void)
{
    ESP_ERROR_CHECK(esp_now_init());
    ESP_ERROR_CHECK(esp_now_set_pmk((uint8_t *)"pmk1234567890123"));

    /* Register broadcast peer — all receivers will hear this */
    esp_now_peer_info_t peer_info = {
        .channel   = CONFIG_WIFI_CHANNEL,
        .ifidx     = WIFI_IF_STA,
        .encrypt   = false,
    };
    memcpy(peer_info.peer_addr, BROADCAST_MAC, 6);
    ESP_ERROR_CHECK(esp_now_add_peer(&peer_info));

    /*
     * CRITICAL for CSI: Set PHY mode to HT20 MCS0.
     * Default ESP-NOW uses legacy 1Mbps DSSS which has NO OFDM subcarriers → NO CSI!
     * With HT20 MCS0, the TX generates OFDM HT-LTF symbols → RX CSI engine fires.
     */
    esp_now_rate_config_t rate_config = {
        .phymode = WIFI_PHY_MODE_HT20,
        .rate    = WIFI_PHY_RATE_MCS0_LGI,
        .ersu    = false,
        .dcm     = false,
    };
    ESP_ERROR_CHECK(esp_now_set_peer_rate_config(peer_info.peer_addr, &rate_config));

    ESP_LOGI(TAG, "ESP-NOW: HT20 MCS0 rate set. Broadcasting MAC: %02x:%02x:%02x:%02x:%02x:%02x",
             CONFIG_CSI_SEND_MAC[0], CONFIG_CSI_SEND_MAC[1], CONFIG_CSI_SEND_MAC[2],
             CONFIG_CSI_SEND_MAC[3], CONFIG_CSI_SEND_MAC[4], CONFIG_CSI_SEND_MAC[5]);
}

/* ─── Broadcast Task ─────────────────────────────────────────────────────── */
static void csi_send_task(void *pvParameter)
{
    /* Compute inter-packet delay: 1000ms / freq, converted to FreeRTOS ticks */
    const uint32_t period_ms = 1000 / CONFIG_SEND_FREQUENCY;
    const TickType_t delay = pdMS_TO_TICKS(period_ms > 0 ? period_ms : 1);

    static uint32_t seq_num = 0;
    uint8_t payload[4];

    uint32_t sent = 0;
    TickType_t last_wake = xTaskGetTickCount();

    while (true) {
        payload[0] = (seq_num >> 24) & 0xFF;
        payload[1] = (seq_num >> 16) & 0xFF;
        payload[2] = (seq_num >>  8) & 0xFF;
        payload[3] = (seq_num      ) & 0xFF;

        esp_err_t ret = esp_now_send(BROADCAST_MAC, payload, sizeof(payload));
        if (ret != ESP_OK) {
            ESP_LOGW(TAG, "esp_now_send failed: %s (seq=%lu)", esp_err_to_name(ret), seq_num);
        }

        seq_num++;
        sent++;

        /* LED: toggle every 50 packets (~1Hz heartbeat at 100pkt/s) */
        if (sent % 50 == 0) {
            gpio_set_level(LED_GPIO, (sent / 50) % 2);
        }

        /* Log rate every 1000 packets */
        if (sent % 1000 == 0) {
            ESP_LOGI(TAG, "TX: sent %lu packets (seq=%lu) @ target %dHz | LED blinks 1Hz",
                     sent, seq_num, CONFIG_SEND_FREQUENCY);
        }

        vTaskDelayUntil(&last_wake, delay);
    }
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

    /* LED init — 5 rapid blinks (TX pattern, distinct from RX's 3 blinks) */
    led_init();
    led_startup_blink();

    wifi_init();
    espnow_init();

    /* Start broadcast task on Core 0 */
    xTaskCreatePinnedToCore(
        csi_send_task,
        "csi_send_task",
        4096,
        NULL,
        5,      /* Priority */
        NULL,
        0       /* Core 0 */
    );

    ESP_LOGI(TAG, "========================================");
    ESP_LOGI(TAG, "TX Broadcaster: %s | CH %d | HT20 MCS0 | %dHz", CONFIG_NODE_ID, CONFIG_WIFI_CHANNEL, CONFIG_SEND_FREQUENCY);
    ESP_LOGI(TAG, "LED GPIO %d: 5-blink startup, then 1Hz heartbeat", LED_GPIO);
    ESP_LOGI(TAG, "TX MAC: %02x:%02x:%02x:%02x:%02x:%02x",
             CONFIG_CSI_SEND_MAC[0], CONFIG_CSI_SEND_MAC[1], CONFIG_CSI_SEND_MAC[2],
             CONFIG_CSI_SEND_MAC[3], CONFIG_CSI_SEND_MAC[4], CONFIG_CSI_SEND_MAC[5]);
    ESP_LOGI(TAG, "========================================");
}
