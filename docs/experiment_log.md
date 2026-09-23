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
- **Next Step**: Commit, push to `main`, and re-trigger GitHub Actions workflow.
