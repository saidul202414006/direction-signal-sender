# Rule 02: Moving vs. Stable Detection & Signal Mapping

## 1. The Moving vs. Stable Problem Statement
When a user rotates their phone, the heading will sweep through intermediary cardinal sectors (e.g., rotating from North through East to reach South).
- **CRITICAL REQUIREMENT**: The application must **NEVER** fire intermediate signals simply because the instantaneous heading passes through a sector during active rotation.
- Signals must ONLY be generated when the phone settles into a cardinal direction and **remains stable**.
- The latency budget from the moment physical movement stops to signal generation must be approximately **1–2 seconds or less**. Delays of 5+ seconds are strictly prohibited.

---

## 2. Sliding Window Stability Algorithm

### State Definitions
```
       ┌───────────────────────────┐
       │           IDLE            │
       └─────────────┬─────────────┘
                     │ (first reading)
                     ▼
       ┌───────────────────────────┐
  ┌───►│          MOVING           │◄──┐
  │    └─────────────┬─────────────┘   │
  │                  │                 │ (angular variance > threshold
  │                  │ (variance < ε   │  OR sector boundary change)
  │                  │  for T_stable)  │
  │                  ▼                 │
  │    ┌───────────────────────────┐   │
  └───-│          STABLE           ├───┘
       └─────────────┬─────────────┘
                     │ (direction != lastSentDirection)
                     ▼
       ┌───────────────────────────┐
       │   TRANSMIT SIGNAL (1..4)  │
       └───────────────────────────┘
```

### Mathematical Metric: Angular Spread & Variance
Maintain a sliding FIFO buffer $B$ of the most recent $K$ samples collected over time window $W$ (e.g., $W \approx 800\text{ ms} - 1200\text{ ms}$ at 20–30 Hz, $K \approx 16 - 30$ samples).

For each new heading sample $(\theta_t, t)$:
1. Add $(\theta_t, t)$ to $B$. Remove samples where $t - t_i > W$.
2. Compute the circular standard deviation or max angular excursion across the window:
$$\Delta\theta_{\max} = \max_{i, j \in B} |\text{circularDistance}(\theta_i, \theta_j)|$$
3. **Movement Condition**:
   - If $\Delta\theta_{\max} > \Theta_{move\_threshold}$ (e.g., $\Theta_{move\_threshold} \approx 8.0^\circ - 12.0^\circ$), the phone is in state **`MOVING`**.
   - Reset stability timer $T_{stable\_start} = \text{null}$.
4. **Stable Condition**:
   - If $\Delta\theta_{\max} \le \Theta_{stable\_threshold}$ (e.g., $\Theta_{stable\_threshold} \approx 6.0^\circ$) AND all samples in $B$ fall within the same cardinal sector $S_{current}$:
     - If $T_{stable\_start}$ is null, set $T_{stable\_start} = t$.
     - If $(t - T_{stable\_start}) \ge T_{min\_stable}$ (where $T_{min\_stable} \approx 600\text{ ms} - 1000\text{ ms}$):
       - State transitions to **`STABLE`**.
       - Direction is confirmed as $S_{confirmed} = S_{current}$.

---

## 3. Strict Signal Mapping (Specification Mandate)
Signals must follow the EXACT numeric mapping defined in [`Project Detail.md`](file:///d:/bin/projects/MMA%205%20m/Project%20Detail.md#L168-L181):

| Cardinal Direction | Signal Integer | Notes |
| :--- | :---: | :--- |
| **North** | **1** | Top of phone facing North sector ($315^\circ - 45^\circ$) |
| **West** | **2** | Top of phone facing West sector ($225^\circ - 315^\circ$) |
| **South** | **3** | Top of phone facing South sector ($135^\circ - 225^\circ$) |
| **East** | **4** | Top of phone facing East sector ($45^\circ - 135^\circ$) |

*Notice: West is 2 and East is 4. Do NOT swap West and East.*

---

## 4. Signal Duplication Suppression Control
- The system maintains a state variable: `lastSentSignal: Int?` (initially `null`).
- When the state enters `STABLE` with confirmed direction $S$ producing signal $V \in \{1, 2, 3, 4\}$:
  ```kotlin
  if (currentSignal != lastSentSignal) {
      triggerSignalTransmission(currentSignal)
      lastSentSignal = currentSignal
  } else {
      // Suppress duplicate transmission; phone is still stable in same direction
  }
  ```
- If the phone remains stationary facing South for 10 minutes, signal `3` is sent **once**, never repeated continuously.
- When the phone rotates away, state returns to `MOVING`.
- Once the phone stabilizes at a new direction (e.g., West), signal `2` is transmitted once and `lastSentSignal` updates to `2`.
