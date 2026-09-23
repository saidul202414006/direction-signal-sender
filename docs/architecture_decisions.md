# Architecture Decision Records (ADRs)

## ADR-001: Autonomous Project Bootstrapping & Rule Decomposition
- **Date**: 2026-09-23
- **Status**: Accepted
- **Context**: The project began with a monolithic 995-line specification [`Project Detail.md`](file:///d:/bin/projects/MMA%205%20m/Project%20Detail.md). Ingesting and recalling every detail without information loss requires structured decomposition.
- **Decision**: Decompose the specification into 6 modular rule files under [`.agents/rules/`](file:///d:/bin/projects/MMA%205%20m/.agents/rules), governed by a root [`AGENTS.md`](file:///d:/bin/projects/MMA%205%20m/AGENTS.md) and backed by a single source of truth [`config/app_config.json`](file:///d:/bin/projects/MMA%205%20m/config/app_config.json).
- **Consequences**: Every sub-domain (sensor DSP, stability detection, networking, lifecycle/background, UI, CI/CD) has isolated, exhaustive technical guidance that automatically loads into the agent's context.

---

## ADR-002: Android Foreground Service with Special-Use Type & WakeLock
- **Date**: 2026-09-23
- **Status**: Accepted
- **Context**: Android 14 (API 34) imposes strict limitations on background sensor execution and kills background services when the screen is locked or the app UI is dismissed.
- **Decision**: Implement a persistent Android `ForegroundService` with `foregroundServiceType="specialUse"` (or `location`), a persistent ongoing Notification, and acquire a `PowerManager.PARTIAL_WAKE_LOCK`. Provide an in-app flow directing the user to grant `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`.
- **Consequences**: Ensures continuous sensor sampling and HTTP signal transmission when the phone screen is off and locked, matching the critical core requirement of the project.

---

## ADR-003: Sliding-Window Angular Variance Filter for Low-Latency Stability Detection
- **Date**: 2026-09-23
- **Status**: Accepted
- **Context**: Rotating the phone causes the heading to pass through intermediate cardinal sectors. Emitting signals during rotation produces severe false triggers. Conversely, waiting too long (>3 seconds) violates the responsive real-time requirement (~1–2 seconds or less).
- **Decision**: Use a circular sliding buffer of heading samples spanning ~800–1200 ms. When angular excursion exceeds the movement threshold (~8°–12°), state is `MOVING` and signals are suppressed. When angular excursion drops below ~6° within a single sector for ≥800 ms, state switches to `STABLE` and triggers the new signal immediately.
- **Consequences**: Satisfies the 1–2 second latency budget while mathematically preventing false triggers during fast or slow rotation.

---

## ADR-004: Decoupled Non-Blocking Asynchronous OkHttp Client
- **Date**: 2026-09-23
- **Status**: Accepted
- **Context**: Transmitting signals over mobile networks or Wi-Fi can encounter DNS delays, network latency, or server lag. Network calls must never block sensor polling or UI updates.
- **Decision**: Offload HTTP POST transmissions to Kotlin Coroutines on `Dispatchers.IO` using a shared `OkHttpClient` instance with tight 5-second timeouts. Duplicate suppression is tracked locally before dispatching to the network queue.
- **Consequences**: Sensor loop never stutters, UI remains fluid at 60 FPS, and network failures report back to UI cleanly.

---

## ADR-005: Headless GitHub Actions CI for Zero-Local-Toolchain APK Compilation
- **Date**: 2026-09-23
- **Status**: Accepted
- **Context**: The user specified that they do not want to install full local Android Studio / SDK toolchains on their host PC just to build the APK.
- **Decision**: Configure a GitHub Actions workflow (`.github/workflows/build-apk.yml`) running on `ubuntu-latest` with Temurin JDK 17, Android Build Tools 34, running unit tests and compiling `assembleDebug`, then uploading the resulting APK as an action artifact.
- **Consequences**: Guarantees clean, reproducible builds and provides a direct APK download link for the user.
