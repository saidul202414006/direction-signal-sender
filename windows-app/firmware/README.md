# ESP32 WiFi CSI Hardware Firmware & Flashing Guide

## 1. Hardware Architecture
The Real Mode sensing network consists of 5 physical nodes:
- **1× TX Node (Transmitter)**: ESP32 DevKit V1 or ESP32-S3 broadcasting CSI-compatible ESP-NOW packets at 100 Hz on Channel 6 HT20.
- **4× RX Nodes (Receivers)**:
  - **Zone A (`RX_S3_A`)**: ESP32-S3 DevKitC-1 (COM port / Corner A).
  - **Zone B (`RX_S3_B`)**: ESP32-S3 DevKitC-1 (COM port / Corner B).
  - **Zone C (`RX_AM_A`)**: AM-036 / ESP32 Classic (COM port / Corner C).
  - **Zone D (`RX_AM_B`)**: AM-036 / ESP32 Classic (COM port / Corner D).

> [!IMPORTANT]
> All AM-036 boards have an unpowered SIM800L module. Ensure NO SIM card is inserted.

---

## 2. Wireless Hotspot Configuration
The RX nodes broadcast raw subcarrier metrics over UDP port `5555` to `255.255.255.255`.
All laptops running the Windows desktop app receive the stream automatically with zero IP configuration.

Configure your Android Mobile Hotspot with:
- **SSID**: `MMA`
- **Password**: `mma151688`
- **Band**: `2.4 GHz` (HT20 Channel 6)

---

## 3. How to Flash the Firmware

### Step 3.1: Flash TX Broadcaster
1. Connect the TX board via USB.
2. Open PowerShell in `windows-app/firmware/tx_broadcaster`:
```powershell
pio run -e tx_s3 -t upload
```
*(LED will blink rapidly 5 times at startup, then pulsate slowly at 1 Hz during normal beaconing).*

### Step 3.2: Flash 4 RX Receivers
Connect each RX board one by one and flash its respective environment:

1. **Zone A (ESP32-S3 #1)**:
```powershell
cd ../rx_receiver
pio run -e rx_s3_a -t upload
```

2. **Zone B (ESP32-S3 #2)**:
```powershell
pio run -e rx_s3_b -t upload
```

3. **Zone C (AM-036 #1)**:
```powershell
pio run -e rx_am_a -t upload
```

4. **Zone D (AM-036 #2)**:
```powershell
pio run -e rx_am_b -t upload
```

*(RX LEDs blink at ~5 Hz when capturing CSI frames from the TX broadcaster).*

---

## 4. Zero-Config UDP Ingestion Verification
1. Turn on the `MMA` 2.4 GHz mobile hotspot.
2. Connect your laptop to the `MMA` Wi-Fi hotspot.
3. Power on the TX node and 4 RX nodes.
4. Launch the Windows desktop app:
   - Click the `?` icon in the bottom right corner.
   - Click the `settings` hyperlink to open Configuration.
   - Select **Real Mode (Hardware UDP Stream)**.
   - The status badge will change to **LISTENING (:5555)** and the 4 RX cards (`RX_S3_A`, `RX_S3_B`, `RX_AM_A`, `RX_AM_B`) will illuminate green with live packet rates (Hz) and subcarrier variance!
