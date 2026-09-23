# Rule 06: Verification, Testing & CI/CD Automation

## 1. Layer-by-Layer Verification Architecture
Verification must be performed progressively across six isolated test layers before deploying the final APK artifact:

### Layer 1: Sensor & DSP Unit Tests (JVM)
- **Sector Classification**: Test all boundary angles:
  - $0^\circ \to \text{North}$
  - $359.9^\circ \to \text{North}$
  - $44.9^\circ \to \text{North}$
  - $45.0^\circ \to \text{East}$
  - $135.0^\circ \to \text{South}$
  - $225.0^\circ \to \text{West}$
  - $314.9^\circ \to \text{West}$
  - $315.0^\circ \to \text{North}$
- **Circular Distance Calculation**: Test wraparound distance:
  - $\Delta(359^\circ, 1^\circ) = 2.0^\circ$
  - $\Delta(10^\circ, 350^\circ) = 20.0^\circ$

### Layer 2: Stability State Machine Tests (JVM)
- Feed a simulated sequence of rapid heading changes ($10^\circ \to 45^\circ \to 90^\circ \to 150^\circ$ over 400 ms).
  - Verify state remains `MOVING`.
  - Verify zero signal emissions during rotation.
- Feed a simulated stable sequence ($180.2^\circ, 179.8^\circ, 180.1^\circ$ for 1200 ms).
  - Verify state transitions to `STABLE`.
  - Verify stable callback triggers exactly once.

### Layer 3: Signal Dispatcher & Duplicate Suppression Tests (JVM)
- Test signal integer mapping:
  - $\text{North} \to 1$
  - $\text{West} \to 2$
  - $\text{South} \to 3$
  - $\text{East} \to 4$
- Feed 10 consecutive `STABLE(South)` events:
  - Verify HTTP sender is invoked exactly **1 time**, not 10 times.
- Feed `STABLE(West)`:
  - Verify HTTP sender is invoked with signal `2`.

### Layer 4: Network & JSON Serialization Tests (JVM)
- Verify generated JSON is strictly `{"signal": <int>}`.
- Test MockWebServer responses: HTTP 200, HTTP 500, timeout handling.

### Layer 5: GitHub Actions CI Build Workflow
The repository must contain `.github/workflows/build-apk.yml`:
1. Checkout source code.
2. Set up JDK 17 (Temurin).
3. Set up Android SDK (Build-Tools, Platform 34).
4. Run `./gradlew test` (fail workflow if any logic test fails).
5. Run `./gradlew assembleDebug` (and assembleRelease if signing configured).
6. Upload generated APK as a downloadable GitHub Actions artifact (`app-debug.apk`).

---

## 2. Physical Device Test Protocol (User Runbook)
When the APK is built and installed on a real smartphone, provide this runbook to the user:
1. Open APK and grant requested permissions (Notification, Battery Exemption).
2. Enter mock or real server URL (e.g., `https://httpbin.org/post` or user endpoint).
3. Toggle Background Service to **ON**.
4. Hold phone flat, top edge pointing North: wait 1–2 seconds. Check UI and server: signal `1`.
5. Rotate phone 90° counter-clockwise to West: wait 1–2 seconds. Check UI and server: signal `2`.
6. Rotate phone 90° counter-clockwise to South: wait 1–2 seconds. Check UI and server: signal `3`.
7. Rotate phone 90° counter-clockwise to East: wait 1–2 seconds. Check UI and server: signal `4`.
8. Lock screen and rotate phone: confirm server receives directional signals while screen is dark.
