# Experiment & Benchmark Log (Append-Only)

All test runs, benchmarks, algorithmic adjustments, and bug fixes must be recorded in this append-only ledger.

---

### [2026-09-23] EXP-001: Architectural Bootstrapping & Rule Decomposition
- **Objective**: Establish the unshakeable architectural foundation, decompose the master specification [`Project Detail.md`](file:///d:/bin/projects/MMA%205%20m/Project%20Detail.md) into 6 active modular rules under [`.agents/rules/`](file:///d:/bin/projects/MMA%205%20m/.agents/rules), generate single source of truth configuration in [`config/app_config.json`](file:///d:/bin/projects/MMA%205%20m/config/app_config.json), and create living documentation logs.
- **Actions Taken**:
  - Validated local toolchain (Git 2.52.0, OpenJDK 17.0.17).
  - Drafted [`AGENTS.md`](file:///d:/bin/projects/MMA%205%20m/AGENTS.md) establishing master operational guardrails and HITL barriers.
  - Decomposed domain requirements into 6 modular active rule files preserving all mathematical formulas, 90° sector boundaries, stability sliding window parameters, signal mappings (N=1, W=2, S=3, E=4), Foreground Service constraints, and GitHub Actions CI protocols.
  - Configured [`config/app_config.json`](file:///d:/bin/projects/MMA%205%20m/config/app_config.json) with single-source-of-truth constants.
  - Initialized dynamic living docs (`environment_state.md`, `architecture_decisions.md`, `task_breakdown.md`, `experiment_log.md`).
- **Result**: PASSED. Workspace architectural foundation ready for user confirmation and Phase 0 implementation.

---

### [2026-09-23] EXP-002: GitHub Actions CI Build Run 1 & Fix
- **Objective**: Execute automated build and test on GitHub Actions runner.
- **Run ID**: `35836936892`
- **Finding**: Task `:app:compileReleaseKotlin` failed with `Cannot find a parameter with this name: lastConfirmedDirection` in `DirectionMonitorService.kt:91`.
- **Fix**: Added `val lastConfirmedDirection: CardinalDirection? = null` to `DirectionState` data class in `TransmissionResult.kt` and updated `DirectionMonitorService.kt`.
- **Result**: Kotlin compilation passed; 1 test failed due to sliding window duration math vs sample count.

---

### [2026-09-23] EXP-003: Stability Sliding Window Latency Optimization & Test Alignment
- **Objective**: Optimize `StabilityDetector` to eliminate double-latency penalty and pass all unit tests.
- **Root Cause**: `StabilityDetector` previously enforced an additional `minStableDurationMs` timer *after* the sliding window cleared, doubling the total wait time to ~1.75s.
- **Fix**: Streamlined stability confirmation so that when samples spanning $\ge 750\text{ ms}$ within the window maintain low excursion ($\le 7.0^\circ$) in the same sector, stability is confirmed immediately (~750–900 ms latency).
- **Result**: PASSED. All unit tests passed and APK built successfully.

---

### [2026-09-23] EXP-004: GitHub Actions CI Build Run 3 (Success & Artifact Export)
- **Objective**: Full automated build, test, and release APK packaging in GitHub Actions.
- **Run ID**: `35838169851`
- **Actions Run URL**: `https://github.com/saidul202414006/direction-signal-sender/actions/runs/35838169851`
- **Result**: **SUCCESS**.
  - All 13 JVM Unit Tests passed across DSP sectoring, circular distance math, sliding-window stability state machine, and duplicate signal suppression.
  - Task `:app:assembleDebug` assembled `app-debug.apk` (6.4 MB).
  - Uploaded artifact `direction-signal-sender-apk` (5.4 MB compressed).
  - Artifact downloaded and verified at [`build-output/app-debug.apk`](file:///d:/bin/projects/MMA%205%20m/build-output/app-debug.apk).
- **Physical Verification**: Ready for physical phone validation per the step-by-step Bangla testing runbook.

---

### [2026-09-23] EXP-005: GitHub Release v1.0.0 & APK Distribution
- **Objective**: Create GitHub Release `v1.0.0` and attach production-ready APK binary asset.
- **Release Page**: `https://github.com/saidul202414006/direction-signal-sender/releases/tag/v1.0.0`
- **Asset Names**:
  - `DirectionSignalSender-v1.0.0.apk` (6.4 MB)
  - `DirectionSignalSender.apk` (6.4 MB)
- **Direct Download URL**: `https://github.com/saidul202414006/direction-signal-sender/releases/download/v1.0.0/DirectionSignalSender-v1.0.0.apk`
- **CI/CD Workflow Update**: Configured automated asset deployment to GitHub Releases for all future tag pushes via `softprops/action-gh-release@v2`.
- **Result**: PASSED. GitHub Release published with live APK download link.

---

### [2026-09-23] EXP-006: Signal-0 Volume Down Toggle Mode Implementation & v1.1.0 Release
- **Objective**: Implement hardware Volume Down button toggle for Signal-0 mode without changing existing direction-based signal logic.
- **Specification Implementation**:
  - **1st Volume Down Click**: Enables Signal-0 mode; direction-based signals (1, 2, 3, 4) are completely paused; sends `{"signal": 0}` continuously at a 1000ms interval.
  - **2nd Volume Down Click**: Disables Signal-0 mode; stops continuous Signal-0 loop; normal direction detection resumes immediately.
  - **Hardware Key Interception**:
    - Foreground: `MainActivity.dispatchKeyEvent` intercepts `KEYCODE_VOLUME_DOWN` synchronously.
    - Background / Screen-off: `VolumeKeyAccessibilityService` intercepts global key events without waking the display.
    - Fallback: `VOLUME_CHANGED_ACTION` BroadcastReceiver monitors volume steps.
    - UI: Dedicated MaterialCardView with status badge and manual toggle button.
  - **Zero Regression**: Direction-based logic (`StabilityDetector`, `SectorClassifier`, `AzimuthCalculator`) remains 100% unchanged.
  - **Unit Testing**: Added `SignalZeroModeTest` verifying toggling, suppression, and resumption.
  - **Version Bump**: `v1.1.0` (versionCode: 2).

---

### [2026-09-23] EXP-007: Built-in Testing Endpoint & Live Web Dashboard (v1.2.0 Release)
- **Objective**: Embed a lightweight, native test server (`LocalTestServer`) inside the APK to provide an immediate testing endpoint and live browser dashboard for JSON verification.
- **Specification Compliance**:
  - **Zero Regression**: Existing endpoint URL input, edit, and save logic remains 100% intact.
  - **External Endpoints**: Users can still configure any external link and send signals to it normally.
  - **Built-in Endpoint**: App exposes `http://127.0.0.1:8080/api/signal` (and LAN IP `http://<ip>:8080/`) directly on the UI with 1-click "Use Test URL" button.
  - **Live Web Page**: Opening the URL in any browser displays a real-time dark-mode dashboard showing the exact incoming JSON payload (`{"signal": <int>}`), direction badge, timestamps, and history log.
  - **Real-Time Polling**: Dashboard auto-updates every 350ms for instant feedback.
  - **Unit Testing**: Added `LocalTestServerTest` verifying POST handling, JSON parsing, 200 OK responses, and `/api/latest` queries.
  - **Version Bump**: `v1.2.0` (versionCode: 3).
