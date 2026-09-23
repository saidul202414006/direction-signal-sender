# Project Task Breakdown: 40 Structured Implementation Steps

This document outlines the 40 granular, progressive implementation tasks required to deliver the production-ready Android APK in strict accordance with [`Project Detail.md`](file:///d:/bin/projects/MMA%205%20m/Project%20Detail.md).

---

### Phase 1: Project Scaffolding & Build System (Tasks 1–5)
- **Task 1**: Initialize Android Gradle Project structure (`settings.gradle.kts`, root `build.gradle.kts`, `app/build.gradle.kts`) with Min SDK 24, Target SDK 34, Kotlin 1.9+.
- **Task 2**: Configure Android Gradle Wrapper (`gradlew`, `gradlew.bat`, `gradle-wrapper.properties` version 8.4+).
- **Task 3**: Add essential production dependencies (Kotlin Coroutines, OkHttp 4.12+, AndroidX Core, Material Components / Jetpack Compose, Lifecycle, JUnit 4).
- **Task 4**: Create `AndroidManifest.xml` declaring all required permissions (`INTERNET`, `ACCESS_NETWORK_STATE`, `WAKE_LOCK`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_SPECIAL_USE`, `POST_NOTIFICATIONS`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, `HIGH_SAMPLING_RATE_SENSORS`).
- **Task 5**: Verify initial Gradle compilation baseline via headless dry-run build configuration.

---

### Phase 2: Sensor Ingestion & Coordinate Geometry (Tasks 6–10)
- **Task 6**: Implement `OrientationSensorManager` subscribing to `Sensor.TYPE_ROTATION_VECTOR` with fallback to `Sensor.TYPE_ACCELEROMETER` + `Sensor.TYPE_MAGNETIC_FIELD`.
- **Task 7**: Implement `AzimuthCalculator` converting sensor rotation matrices into radians $[-\pi, +\pi]$ and normalized degrees $[0^\circ, 360^\circ)$.
- **Task 8**: Implement circular distance utility `circularDistance(angle1, angle2)` handling the $359^\circ \leftrightarrow 1^\circ$ North seam.
- **Task 9**: Implement vector-space circular moving average filter to eliminate high-frequency magnetic noise without phase lag.
- **Task 10**: Write JVM Unit Tests (`HeadingCalculatorTest`) verifying exact angle calculation across all 4 quadrants.

---

### Phase 3: Cardinal Direction Sector Classification (Tasks 11–14)
- **Task 11**: Define `CardinalDirection` enum (`NORTH`, `WEST`, `SOUTH`, `EAST`) with exact angular sectors:
  - North: $[315^\circ, 360^\circ) \cup [0^\circ, 45^\circ)$
  - East: $[45^\circ, 135^\circ)$
  - South: $[135^\circ, 225^\circ)$
  - West: $[225^\circ, 315^\circ)$
- **Task 12**: Implement `SectorClassifier.classify(azimuthDeg)` strictly respecting sector boundaries and the $0^\circ/360^\circ$ wraparound seam.
- **Task 13**: Add magnetic declination compensation option via `GeomagneticField` when coarse location is permitted.
- **Task 14**: Write JVM Unit Tests (`SectorClassifierTest`) testing boundary edge cases ($0^\circ, 44.9^\circ, 45.0^\circ, 134.9^\circ, 135.0^\circ, 224.9^\circ, 225.0^\circ, 314.9^\circ, 315.0^\circ, 359.9^\circ$).

---

### Phase 4: Movement vs. Stability State Machine (Tasks 15–18)
- **Task 15**: Implement `StabilityDetector` with sliding time window buffer (~800–1200 ms).
- **Task 16**: Implement angular variance / excursion calculator: evaluate whether max angular excursion within the window exceeds movement threshold ($\Theta_{move} \approx 8.0^\circ - 12.0^\circ$).
- **Task 17**: Implement state machine transitioning between `MOVING` and `STABLE` when heading remains within a single sector for $\ge 800\text{ ms}$, ensuring total latency $\le 1–2\text{ seconds}$.
- **Task 18**: Write JVM Unit Tests (`StabilityDetectorTest`) simulating rapid rotation sequences (verifying zero signals emitted while moving) followed by stabilization (verifying rapid transition to `STABLE`).

---

### Phase 5: Strict Signal Mapping & Duplicate Suppression (Tasks 19–21)
- **Task 19**: Implement `SignalMapper` mapping cardinal directions strictly:
  - **North $\to 1$**
  - **West $\to 2$**
  - **South $\to 3$**
  - **East $\to 4$**
- **Task 20**: Implement `DuplicateFilter` tracking `lastConfirmedDirection` / `lastSentSignal` to prevent duplicate transmissions while the device remains stationary in the same sector.
- **Task 21**: Write JVM Unit Tests (`SignalDispatcherTest`) verifying mapping precision and duplicate suppression over repetitive stable events.

---

### Phase 6: Networking Engine & JSON API Client (Tasks 22–25)
- **Task 22**: Define JSON data transfer object `SignalPayload(val signal: Int)` serializing strictly to `{"signal": <int>}`.
- **Task 23**: Implement `SignalApiClient` with OkHttp executing asynchronous POST requests on `Dispatchers.IO` with 5-second connect/read timeouts.
- **Task 24**: Implement `TransmissionResult` model capturing HTTP status code (e.g. 200), latency in milliseconds, error message, and timestamp.
- **Task 25**: Write MockWebServer JVM Integration Tests verifying proper JSON serialization, timeout resilience, and status code propagation.

---

### Phase 7: Persistence & Local Configuration (Tasks 26–28)
- **Task 26**: Implement `PreferencesRepository` using Android `SharedPreferences` to persist user-configured endpoint URL, service enable/disable state, and last signal sent.
- **Task 27**: Add URL validation and sanitization utility ensuring valid scheme (`http://` or `https://`) and host syntax.
- **Task 28**: Write unit tests for configuration persistence and default fallback handling.

---

### Phase 8: Android Foreground Service & Screen-Off Execution (Tasks 29–32)
- **Task 29**: Create `DirectionMonitorService` running as an Android Foreground Service with `foregroundServiceType="specialUse"`.
- **Task 30**: Implement ongoing persistent Notification with `NotificationChannel` displaying live direction, heading, and transmission status.
- **Task 31**: Implement `PowerManager.PARTIAL_WAKE_LOCK` lifecycle management to keep the CPU active and sensor listener running when the screen is locked/dark.
- **Task 32**: Implement Service communication binding / StateFlow event bus connecting the Service to the UI.

---

### Phase 9: User Interface & User Experience (Tasks 33–36)
- **Task 33**: Build the main UI layout:
  - Endpoint URL input field & save action.
  - Background Service ON/OFF toggle switch.
  - Direction readout (NORTH, WEST, SOUTH, EAST).
  - Heading angle indicator (e.g., `Heading: 182°`).
- **Task 34**: Add Motion Status badge (`STATUS: MOVING` in amber vs. `STATUS: STABLE` in green).
- **Task 35**: Add Last Signal Sent card and real-time HTTP transmission status badge (`HTTP 200 - Sent` vs. error details).
- **Task 36**: Design clean vector app icon and launcher assets representing directional compass and signal transmission.

---

### Phase 10: Permissions Flow & System Diagnostics (Tasks 37–38)
- **Task 37**: Implement proactive runtime permission checker for `POST_NOTIFICATIONS`, `INTERNET`, `WAKE_LOCK`, and battery optimization exemption.
- **Task 38**: Add settings redirect buttons taking the user directly to system settings (`ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, `ACTION_APPLICATION_DETAILS_SETTINGS`) when permissions are missing.

---

### Phase 11: CI/CD Pipeline & GitHub Actions Automation (Tasks 39–40)
- **Task 39**: Create `.github/workflows/build-apk.yml` with automated JDK 17, Android SDK 34, test verification (`./gradlew test`), and APK assembly (`./gradlew assembleDebug`).
- **Task 40**: Configure GitHub Actions artifact upload for `app-debug.apk` and create physical device validation documentation.
