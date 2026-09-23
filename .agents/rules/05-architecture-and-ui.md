# Rule 05: Application Architecture, UI & State Management

## 1. Architectural Pattern: Clean MVVM + Service Layer
The application codebase is structured into clear separation of concerns:
- **`data/`**:
  - `model/`: `Direction`, `SignalPayload`, `TransmissionResult`, `SensorState`.
  - `preferences/`: `PreferenceManager` (persisting URL, service state, last signal).
  - `network/`: `SignalApiClient` (OkHttp implementation).
- **`domain/`**:
  - `dsp/`: `HeadingCalculator`, `SectorClassifier`, `MovingAverageFilter`.
  - `stability/`: `StabilityDetector` (sliding-window state machine).
  - `dispatcher/`: `SignalDispatcher` (duplicate suppression and trigger coordinator).
- **`service/`**:
  - `DirectionMonitorService`: Android Foreground Service coordinating sensor callbacks, stability evaluation, and HTTP dispatching.
- **`ui/`**:
  - `viewmodel/`: `MainViewModel` observing service state via Kotlin `StateFlow` / `SharedFlow`.
  - `components/`: UI cards, compass display, status indicators.
  - `MainActivity`: Lifecycle owner and permission coordinator.

---

## 2. UI Layout Specifications
The user interface must be clean, responsive, and functional:
1. **Endpoint Configuration Card**:
   - URL input field (`android.widget.EditText` or Compose `OutlinedTextField`).
   - Save / Update button with URL format validation.
2. **Background Service Control**:
   - Prominent Toggle Switch (`ON` / `OFF`).
   - State indicator explaining whether background monitoring is currently active.
3. **Direction & Heading Display**:
   - Large primary text: **NORTH**, **WEST**, **SOUTH**, or **EAST**.
   - Azimuth angle readout: e.g., `Heading: 182°`.
   - Visual compass arc indicating sector bounds.
4. **Motion & Stability Status Badge**:
   - High-contrast visual badge:
     - `STATUS: MOVING` (Amber / Warning color during rotation).
     - `STATUS: STABLE` (Green / Success color once stabilized).
5. **Last Signal & Transmission Card**:
   - Displays the last confirmed signal number (`1`, `2`, `3`, or `4`).
   - HTTP response code (`200 OK`, `404`, `500`, or network error message).
   - Timestamp of last transmission.
6. **Permission Diagnostic Banner**:
   - Evaluates notification, wake lock, and battery optimization statuses.
   - Shows action buttons directly opening system settings if permissions are absent.

---

## 3. Persistent Storage
All persistent attributes are stored via Android `SharedPreferences` (or Jetpack `DataStore`):
- `KEY_ENDPOINT_URL`: Default `"https://example.com/api/direction"`
- `KEY_SERVICE_ENABLED`: Boolean
- `KEY_LAST_DIRECTION`: String ("NORTH", "WEST", "SOUTH", "EAST")
- `KEY_LAST_SIGNAL`: Int (1..4)
- `KEY_LAST_HTTP_STATUS`: String
