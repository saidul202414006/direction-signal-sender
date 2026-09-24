"""
Serial-to-UDP Bridge & Live Packet Monitor for WiFi CSI Hardware
Reads live CSI lines from USB Serial (COMx) at 921600 / 115200 baud,
prints verification stats, and forwards them to UDP 127.0.0.1:5555
so the Windows Zone Detection App receives the live hardware stream.
"""

import sys
import time
import socket
import serial
import serial.tools.list_ports

UDP_IP = "127.0.0.1"
UDP_PORT = 5555

def get_available_ports():
    return [p.device for p in serial.tools.list_ports.comports()]

def run_bridge(port=None, baud=921600, duration_sec=None):
    if not port:
        ports = get_available_ports()
        if not ports:
            print("[!] No COM ports detected! Please connect the ESP32 board.")
            return False
        port = ports[0]

    print(f"[*] Opening Serial Port {port} @ {baud} baud...")
    try:
        ser = serial.Serial(port, baud, timeout=1.5)
    except Exception as e:
        # Fallback to 115200 if 921600 fails
        try:
            print(f"[*] Trying fallback baud 115200 on {port}...")
            ser = serial.Serial(port, 115200, timeout=1.5)
        except Exception as e2:
            print(f"[!] Failed to open {port}: {e2}")
            return False

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    print(f"[+] Serial Bridge ACTIVE: {port} -> UDP {UDP_IP}:{UDP_PORT}")
    print("[*] Listening for incoming CSI packets from TX...")

    start_time = time.time()
    packet_count = 0
    matched_node = None

    try:
        while True:
            if duration_sec and (time.time() - start_time) > duration_sec:
                break

            line = ser.readline().decode('utf-8', errors='ignore').strip()
            if not line:
                continue

            # Check if this is a CSI packet
            if line.startswith("RX_") or line.startswith("CSI_"):
                packet_count += 1
                parts = line.split(',')
                node_id = parts[0]
                matched_node = node_id
                rssi = parts[2] if len(parts) > 2 else "?"
                sub_count = parts[4] if len(parts) > 4 else "?"

                # Forward to local Windows App UDP port 5555
                sock.sendto(line.encode('utf-8'), (UDP_IP, UDP_PORT))

                if packet_count % 25 == 0:
                    elapsed = time.time() - start_time
                    rate = packet_count / elapsed if elapsed > 0 else 0
                    print(f"[LIVE RX VERIFIED] Node={node_id} | Packets={packet_count} | Rate={rate:.1f} Hz | RSSI={rssi} dBm | Subs={sub_count}")

            elif "csi" in line.lower() or "wifi" in line.lower() or "ready" in line.lower() or "boot" in line.lower():
                print(f"[BOOT LOG] {line}")

    except KeyboardInterrupt:
        print("\n[*] Stopped by user.")
    finally:
        ser.close()
        sock.close()

    print(f"[+] Session completed: {packet_count} packets processed for Node={matched_node}")
    return packet_count > 0

if __name__ == "__main__":
    port_arg = sys.argv[1] if len(sys.argv) > 1 else None
    baud_arg = int(sys.argv[2]) if len(sys.argv) > 2 else 921600
    dur_arg = float(sys.argv[3]) if len(sys.argv) > 3 else None
    run_bridge(port_arg, baud_arg, dur_arg)
