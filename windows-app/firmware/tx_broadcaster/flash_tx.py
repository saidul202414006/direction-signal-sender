import sys
import os
import time
import subprocess
import serial

PORT = "COM7"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BUILD_DIR = os.path.join(SCRIPT_DIR, ".pio", "build", "tx_devkit")

BOOTLOADER = os.path.join(BUILD_DIR, "bootloader.bin")
PARTITIONS = os.path.join(BUILD_DIR, "partitions.bin")
FIRMWARE = os.path.join(BUILD_DIR, "firmware.bin")

def main():
    print("=" * 60)
    print("[*] FLASHING TX (ESP32 DevKit V1) on " + PORT)
    print("--> Please PRESS and HOLD the [BOOT] button on the board now!")
    print("=" * 60)

    cmd_write = [
        sys.executable, "-m", "esptool",
        "--port", PORT,
        "--baud", "460800",
        "--connect-attempts", "30",
        "--after", "hard-reset",
        "write-flash",
        "-z",
        "--flash-mode", "dio",
        "--flash-freq", "40m",
        "0x1000", BOOTLOADER,
        "0x8000", PARTITIONS,
        "0x10000", FIRMWARE
    ]

    ret = subprocess.run(cmd_write)
    if ret.returncode != 0:
        print("\n[!] Flashing failed! Retrying at 115200 baud...")
        cmd_write[cmd_write.index("460800")] = "115200"
        ret = subprocess.run(cmd_write)
        if ret.returncode != 0:
            print("\n[!] Could not connect. Please hold BOOT button firmly while connecting.")
            return False

    print("\n" + "=" * 60)
    print("[+] Flash successful! Resetting and checking boot logs & 2Hz LED...")
    print("=" * 60)
    time.sleep(1.0)

    try:
        ser = serial.Serial(PORT, 115200, timeout=1.5)
        ser.dtr = False
        ser.rts = True
        time.sleep(0.1)
        ser.rts = False
        start_t = time.time()
        while time.time() - start_t < 6.0:
            line = ser.readline().decode('latin1', errors='ignore').strip()
            if line:
                print(f"  [BOOT] {line}")
        ser.close()
    except Exception as e:
        print(f"[!] Serial note: {e}")

    return True

if __name__ == "__main__":
    main()
