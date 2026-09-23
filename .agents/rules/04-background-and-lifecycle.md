# Rule 04: Background Service, Screen-Off Operation & Permissions

## 1. Foreground Service Architecture
In modern Android (Android 8.0 Oreo through Android 14+ UpsideDownCake), background sensors cannot run in an ordinary background thread after an Activity is dismissed without the OS throttling or killing the process.
- Continuous background sensor monitoring **MUST** be implemented using a **Foreground Service** (`android.app.Service`) running in its own lifecycle.
- The service displays an ongoing, non-dismissible persistent notification indicating active direction monitoring and current state.

### Manifest Declarations
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.HIGH_SAMPLING_RATE_SENSORS" />
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />

<service
    android:name=".service.DirectionMonitorService"
    android:enabled="true"
    android:exported="false"
    android:foregroundServiceType="specialUse">
    <property
        android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
        android:value="Continuous physical orientation and heading monitoring for automated directional signaling even when screen is locked" />
</service>
```

---

## 2. Screen-Off & Locked Device Execution (WakeLock)
When the user locks their phone or the screen turns off:
- Android power management suspends CPU execution unless a `PARTIAL_WAKE_LOCK` is held.
- The Service must acquire a reference-counted `PowerManager.PARTIAL_WAKE_LOCK` upon starting, and release it safely in `onDestroy()`.
- WakeLock tag: `"DirectionMonitor::SensorWakeLock"`.

```kotlin
// WakeLock Management
val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "DirectionMonitor::SensorWakeLock").apply {
    setReferenceCounted(false)
    acquire(24 * 60 * 60 * 1000L) // 24-hour safety timeout
}
```

---

## 3. Battery Optimization Exemption
Manufacturers (Samsung, Xiaomi, Huawei, etc.) aggressively kill background processes unless exempted from battery optimizations.
- The app must check:
  ```kotlin
  val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
  val isIgnoringBatteryOptimizations = powerManager.isIgnoringBatteryOptimizations(packageName)
  ```
- If false, the application guides the user to grant the exemption via `Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))`.

---

## 4. Lifecycle Separation
The application distinguishes between five distinct states:
1. **App UI in Foreground**: Activity bound to Service, live UI updates at 20–30 Hz.
2. **App UI Minimized / Closed**: Activity destroyed, Service continues running in foreground with persistent notification; direction detection and signal dispatching remain 100% active.
3. **Screen Locked / Off**: Partial WakeLock keeps CPU active; sensor listener receives hardware interrupts; signals fire upon direction stabilization.
4. **Service Stopped by User**: Toggle pressed to OFF; Service stops, WakeLock released, sensors unregistered, notification removed.
5. **Force-Stop by OS/User**: Process terminated; restart on next explicit app launch (SharedPreferences retains configured endpoint and toggle state).
