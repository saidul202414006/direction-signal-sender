# Zone Detection Monitor - Windows Desktop Application (.exe)

This Windows desktop application receives live RF/CSI zone signals from the Android mobile application and visualizes room occupancy across 4 quadrants with real-time procedural waveform monitors.

---

## 1. Interface & Topology (Matches Hand-Drawn Reference Sketch)

### A. Rectangular Room Layout
- **Center**: `ESP32 DevKit V1` (`<- TX` beacon).
- **Upper Corners**: `ESP32-S3 (RX)` nodes.
- **Lower Corners**: `AM036 (RX)` nodes.
- **Quadrants**:
  - **Zone B**: Top-Left
  - **Zone A**: Top-Right
  - **Zone C**: Bottom-Left
  - **Zone D**: Bottom-Right
- **CSI Rays**: Diagonal dashed transmission lines connecting the center TX to each corner RX.
- **Presence Glow**: When an active signal is received, the corresponding zone and CSI ray illuminate with a vibrant green beacon glow while non-active zones remain dormant.

### B. Zone Signal Panels
- Four vertically stacked live waveform monitors:
  - `ZONE A Signal:`
  - `ZONE B Signal:`
  - `ZONE C Signal:`
  - `ZONE D Signal:`
- Each graph includes a clearly marked dashed threshold line: **`Level for Presence`**.
- **Signal 0 (No Detection)**: All 4 graphs fluctuate naturally well below the presence threshold.
- **Signal 1 (Zone A)**: Zone A graph swells and fluctuates across and above the presence threshold.
- **Signal 2 (Zone B)**: Zone B graph fluctuates across and above the presence threshold.
- **Signal 3 (Zone C)**: Zone C graph fluctuates across and above the presence threshold.
- **Signal 4 (Zone D)**: Zone D graph fluctuates across and above the presence threshold.

### C. Help Button (`?`) & Configuration Modal
- Located at the bottom-left corner of the window.
- Displays the dynamically detected local network IP (e.g. `192.168.1.15:5000`).
- Provides 1-click URL copy for the mobile app endpoint: `http://192.168.x.x:5000/api/signal`.
- Supports switching between **Application Mode** (active) and **Real Mode** (future raw CSI processing).

---

## 2. Signal Protocol

- **HTTP Method**: `POST`
- **Path**: `/api/signal` (or `/`)
- **Headers**: `Content-Type: application/json`
- **Body**:
  ```json
  {
    "signal": 1
  }
  ```
- **Mapping**:
  | Signal | Detected Zone | Room Highlight | Waveform Behavior |
  | :---: | :---: | :---: | :--- |
  | `0` | No Detection | All dormant | All 4 graphs stay below threshold with natural fluctuations |
  | `1` | Zone A | Zone A glowing | Zone A graph crosses above presence threshold |
  | `2` | Zone B | Zone B glowing | Zone B graph crosses above presence threshold |
  | `3` | Zone C | Zone C glowing | Zone C graph crosses above presence threshold |
  | `4` | Zone D | Zone D glowing | Zone D graph crosses above presence threshold |

---

## 3. Building the Windows Executable (.exe)

### Automated Cloud Build (GitHub Actions)
Pushes to `main` or release tags trigger `.github/workflows/build-windows-app.yml` on `windows-latest` to compile and publish the standalone executable `ZoneDetectionApp.exe`.
