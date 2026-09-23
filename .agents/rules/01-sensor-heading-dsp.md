# Rule 01: Sensor Heading & DSP Pipeline

## 1. Android Sensor Hardware Architecture
The application must determine which cardinal direction the phone's **front-camera / top edge** is pointing toward. The phone's top edge serves as the primary heading vector.

### Primary Sensor Pipeline: Rotation Vector
The primary sensor is `Sensor.TYPE_ROTATION_VECTOR` (or `Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR` for lower power / no-gyroscope devices).
- Modern Android devices fuse accelerometer, magnetometer, and gyroscope inside hardware sensor hubs to provide a drift-free quaternion vector.
- Sampling rate: `SensorManager.SENSOR_DELAY_UI` (approx. 60,000 µs / 16.6 Hz) or `SensorManager.SENSOR_DELAY_GAME` (approx. 20,000 µs / 50 Hz). For background stability and battery conservation, `SENSOR_DELAY_UI` or adaptive 20–30 Hz sampling is optimal.

### Fallback Sensor Pipeline: Accelerometer + Magnetometer
For devices without a hardware rotation vector sensor, implement an automatic fallback using:
- `Sensor.TYPE_ACCELEROMETER`
- `Sensor.TYPE_MAGNETIC_FIELD`

```kotlin
// Fallback Matrix Computation
val R = FloatArray(9)
val I = FloatArray(9)
val success = SensorManager.getRotationMatrix(R, I, gravityValues, geomagneticValues)
if (success) {
    val orientation = FloatArray(3)
    SensorManager.getOrientation(R, orientation)
    val azimuthRad = orientation[0] // [-PI, PI]
}
```

---

## 2. Azimuth Calculation & Coordinate Remapping
Android defines default coordinates as:
- $X$: Horizontal, pointing right along the screen width.
- $Y$: Vertical, pointing up toward the top edge / front camera along the screen length.
- $Z$: Perpendicular pointing out of the screen toward the user.

When the phone is held flat or tilted, azimuth is the angle around the $Z$-axis between the $Y$-axis (top of phone) and Magnetic North.

### Normalization to [0°, 360°)
The raw azimuth $\theta_{raw}$ from `SensorManager.getOrientation` is returned in radians $[-\pi, +\pi]$.
Convert and normalize to degrees $[0^\circ, 360^\circ)$:
$$\theta_{deg} = \left(\text{toDegrees}(\theta_{raw}) + 360\right) \pmod{360}$$

### True North vs. Magnetic North (Declination)
If coarse location permission (`ACCESS_COARSE_LOCATION`) is available, compute magnetic declination using Android's `android.hardware.GeomagneticField`:
$$\theta_{true} = (\theta_{magnetic} + \text{declination} + 360) \pmod{360}$$
If location permission is not granted, default cleanly to Magnetic North without failing or crashing.

---

## 3. Cardinal Direction Sectors & 0°/360° Wraparound
The heading space $[0^\circ, 360^\circ)$ is partitioned into four 90° cardinal sectors centered on the standard axes:

| Direction | Nominal Center | Sector Range (Inclusive - Exclusive) | Angle Math Condition |
| :--- | :---: | :---: | :--- |
| **North** | $0^\circ$ / $360^\circ$ | $[315^\circ, 360^\circ) \cup [0^\circ, 45^\circ)$ | $\theta \ge 315.0^\circ \lor \theta < 45.0^\circ$ |
| **East** | $90^\circ$ | $[45^\circ, 135^\circ)$ | $\theta \ge 45.0^\circ \land \theta < 135.0^\circ$ |
| **South** | $180^\circ$ | $[135^\circ, 225^\circ)$ | $\theta \ge 135.0^\circ \land \theta < 225.0^\circ$ |
| **West** | $270^\circ$ | $[225^\circ, 315^\circ)$ | $\theta \ge 225.0^\circ \land \theta < 315.0^\circ$ |

### Strict Boundary Handling
- The function classifying heading MUST handle boundary condition $360.0^\circ \equiv 0.0^\circ$.
- Never perform naive linear interpolation across the $359^\circ \to 1^\circ$ seam.
- Use circular distance when computing angular separation:
$$\Delta\theta(\theta_1, \theta_2) = 180 - |180 - |\theta_1 - \theta_2| \pmod{360}|$$

---

## 4. Low-Pass Smoothing & Outlier Rejection
To prevent high-frequency magnetic jitter without sacrificing response time:
- Maintain an exponential moving average (EMA) or rolling circular buffer of recent azimuth angles.
- Because angles wrap around $360^\circ$, perform smoothing in Cartesian vector space:
$$\bar{x} = \frac{1}{N}\sum_{i=1}^N \cos(\theta_i), \quad \bar{y} = \frac{1}{N}\sum_{i=1}^N \sin(\theta_i)$$
$$\bar{\theta} = (\text{atan2}(\bar{y}, \bar{x}) \cdot \frac{180}{\pi} + 360) \pmod{360}$$
This guarantees mathematical correctness across the North boundary ($359^\circ \leftrightarrow 1^\circ$).
