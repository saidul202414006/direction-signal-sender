# AGENTS.md - Master Operational Rules & Architectural Guardrails

## 1. Project Overview & Operational Authority
This workspace contains the **Android Direction Detection & Signal Sender APK** project.
The operational rules defined in this file and in [`.agents/rules/`](file:///d:/bin/projects/MMA%205%20m/.agents/rules) govern all autonomous and semi-autonomous engineering activities in this workspace.

- **Master Specification**: [`Project Detail.md`](file:///d:/bin/projects/MMA%205%20m/Project%20Detail.md)
- **Primary Language**: Kotlin / Android SDK (Min SDK 24 / Target SDK 34)
- **Communication Language**: **Bangla (বাংলা)** for all updates, logs, explanations, and user interactions (technical terms in English where needed).
- **Core Goal**: A production-ready, genuine, distributable Android APK (not a prototype, simulation, or mock) that detects phone cardinal orientation, filters movement, verifies stability within 1–2 seconds, suppresses duplicate signals, and transmits signals 1 (North), 2 (West), 3 (South), 4 (East) via JSON HTTP POST to a user-configured endpoint, continuously running in the background even with screen off/locked.

---

## 2. Hard Human-In-The-Loop (HITL) Barriers: "STOP AND ASK" Triggers
The autonomous agent MUST immediately pause execution and request human action when encountering:
1. **GitHub Credentials & Repository Creation**:
   - Never generate, guess, or fake GitHub personal access tokens (PAT).
   - Stop and request user credentials/repo setup when publishing to private GitHub repository.
2. **Physical Device Sensor Verification**:
   - The agent cannot physically rotate a physical Android smartphone in real Earth magnetic fields.
   - When unit tests and CI builds pass, provide exact step-by-step physical testing procedures in Bangla to the user.
3. **External Server Production Endpoint**:
   - Before firing network signals to proprietary private production endpoints, verify URL with the user.
4. **Destructive Operations**:
   - Any deletion of project history or uncommitted critical assets.

---

## 3. Strict Project Scope Boundaries

### IN-SCOPE:
- Real Android sensor data pipeline (`Sensor.TYPE_ROTATION_VECTOR` with fallback to `Sensor.TYPE_ACCELEROMETER` + `Sensor.TYPE_MAGNETIC_FIELD`).
- Direction classification with 90° cardinal sectors centered at North (~0°), East (~90°), South (~180°), West (~270°), accounting for 0°/360° boundary wraparound.
- Real-time Moving vs. Stable state machine with sliding-window angular variance filtering (target latency ~1–2 seconds or less).
- Strict duplicate transmission prevention (signals sent once per newly confirmed stable direction).
- Strict signal mapping: **North = 1, West = 2, South = 3, East = 4**.
- Configurable HTTP POST client sending `{"signal": <int>}` with complete status reporting (HTTP status code, timestamp, success/error state).
- Foreground Service with persistent status notification, WakeLock management for screen-off execution, and battery optimization exemption guides.
- Runtime permission request handling (`POST_NOTIFICATIONS`, `WAKE_LOCK`, `INTERNET`, `ACCESS_COARSE_LOCATION` for magnetic declination if needed).
- Clean, responsive UI with URL input, background toggle, current direction, heading angle, moving/stable indicator, last signal, and transmission status.
- GitHub Actions CI/CD pipeline to assemble and export release/debug APK artifacts.
- Complete modular unit test suite for calculation, sectoring, stability, and duplicate suppression.

### STRICTLY OUT-OF-SCOPE:
- No fake/mock sensor generators in final APK builds.
- No simulated HTTP mock responses in production paths.
- No unnecessary bloat (no ads, no analytics trackers, no bloated UI animations).
- No GPS-only heading assumptions (GPS does not provide orientation when stationary).
- No hardcoded endpoints that prevent user reconfiguration.

---

## 4. Execution Principles & Phase Transition Protocols
1. **Zero Information Loss**: Every constraint from [`Project Detail.md`](file:///d:/bin/projects/MMA%205%20m/Project%20Detail.md) is preserved in active rule modules.
2. **Layer-by-Layer Verification**:
   - Mathematical / Logic layer (Sectoring, 360° Wrap, Sliding Window Stability, Signal Mapping) verified via JVM Unit Tests (`./gradlew test`).
   - Network layer verified via mock web server / integration tests.
   - Android Build verified via Gradle wrapper and GitHub Actions CI workflow.
   - Physical device verification verified via structured user runbook.
3. **Append-Only Logging**: All benchmark results, architectural decisions, and experiment notes must be logged to [`docs/`](file:///d:/bin/projects/MMA%205%20m/docs) dynamically.
4. **Single Source of Truth**: All operational constants reside in [`config/app_config.json`](file:///d:/bin/projects/MMA%205%20m/config/app_config.json) and must not be duplicated as magic literals in source files.
