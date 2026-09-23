# PROJECT: Android Direction Detection & Signal Sender APK

## 1. FIRST: UNDERSTAND THE PROJECT COMPLETELY

Before writing any code, fully understand the complete requirements below.

Do not start implementation immediately.

First, give me a concise recap in **Bangla** explaining:

* What application you understand I want.
* How the direction detection should work.
* How the stability detection should work.
* When a signal should and should not be sent.
* How the external URL/JSON communication should work.
* How background operation should work.
* What permissions are required and why.
* What the Android application will contain.
* How you plan to verify the complete system.

After I confirm your understanding, create the implementation plan.

---

# 2. CORE PURPOSE

I want a **real, fully working Android APK**, not a prototype, mockup, simulation, or fake implementation.

The application will use the phone's sensors to determine which of the four Earth directions the phone's **front-camera/top side** is pointing toward:

* North
* West
* South
* East

The phone's front-camera/top direction is considered the phone's **main heading direction**.

The Earth directions themselves remain fixed.

When I physically rotate the phone, the phone heading changes relative to North/South/East/West.

The application must continuously monitor this heading while it is enabled.

---

# 3. DIRECTION DETECTION

Use the appropriate Android sensors and Android-supported heading/orientation methods.

Do NOT assume that GPS alone can determine the phone's heading while the phone is stationary.

Use the appropriate sensor combination and Android APIs required for reliable compass/heading detection.

The four direction sectors should be approximately:

* North → around 0°
* East → around 90°
* South → around 180°
* West → around 270°

The system must not require the phone to be perfectly aligned with exactly 0°, 90°, 180°, or 270°.

Use practical direction ranges/sectors so that small physical alignment errors are tolerated.

For example, a 90° sector per cardinal direction can be used:

* North: approximately 315°–45°
* East: approximately 45°–135°
* South: approximately 135°–225°
* West: approximately 225°–315°

Handle the 0°/360° boundary correctly.

Do not hard-code an unnecessarily rigid exact-angle comparison.

If, during implementation/testing, a technically better filtering or sector approach is appropriate, use it after verifying the reasoning.

---

# 4. MOVING VS STABLE DETECTION

This is one of the most important requirements.

When I rotate the phone, the application must **NOT immediately send signals** simply because the heading temporarily passes through a direction sector.

Example:

I rotate:

North → East → South

While the phone is continuously rotating, the application should recognize that the heading is changing and should NOT send a South signal just because the heading temporarily enters the South sector.

The application should wait until the phone becomes stable.

The intended flow is:

Phone rotating
→ heading changing
→ no signal

Then:

Phone reaches a direction
→ heading becomes stable
→ stability confirmation
→ direction confirmed
→ signal sent immediately

Use a proper stability detection/filtering mechanism based on multiple sensor readings over a short time window.

Do not determine stability from a single sensor reading.

The stability threshold/window should be designed so that the application feels responsive.

The target is approximately **1–2 seconds or less from the moment the phone becomes stably positioned to the signal being sent**, including the application's processing/network behavior as far as realistically possible.

Do not introduce unnecessary delays such as 5 seconds or longer.

---

# 5. SIGNAL DUPLICATION CONTROL

Do not repeatedly send the same signal while the phone remains stationary.

For example:

If the phone becomes stable facing South:

```text
South confirmed
→ Send 3
```

Then, while the phone remains stably facing South:

```text
Do NOT repeatedly send:
3
3
3
3
3
...
```

Only send again when the phone moves to another direction and that new direction becomes stable.

Example:

```text
South
→ signal 3

Rotate phone
→ moving
→ no signal

West
→ stable
→ signal 2
```

The application should therefore maintain the last confirmed/sent direction.

---

# 6. SIGNAL MAPPING

Use exactly this mapping:

| Direction | Signal |
| --------- | -----: |
| North     |      1 |
| West      |      2 |
| South     |      3 |
| East      |      4 |

When a new stable direction is confirmed, generate the corresponding signal.

---

# 7. EXTERNAL URL / API

The application must allow me to configure an external URL/endpoint.

This URL is where the application will send the detected signal.

The URL must be configurable from inside the application.

Example:

```text
Endpoint URL:
https://example.com/api/direction
```

When a direction is confirmed, send the corresponding signal to that endpoint.

The signal should be sent as JSON.

For example:

```json
{
  "signal": 3
}
```

For North:

```json
{
  "signal": 1
}
```

For West:

```json
{
  "signal": 2
}
```

For South:

```json
{
  "signal": 3
}
```

For East:

```json
{
  "signal": 4
}
```

Design the networking layer cleanly so the endpoint can be changed without modifying the application code.

Handle HTTP success/failure, connection errors, timeout, and invalid endpoint cases properly.

Do not allow a network request to block the sensor-processing system.

---

# 8. APPLICATION UI

Keep the UI **simple, clean, modern, and functional**.

Do not over-engineer the design.

The application should at minimum provide:

### A. Endpoint URL

A field where I can enter/change the external endpoint URL.

### B. Background Operation Control

A clear control/button/toggle for enabling the continuous background operation.

Example concept:

```text
Background Service
[ ON ]
```

When enabled, the application should continue operating in the background according to Android's actual background-service restrictions and the permissions/settings required by the device.

### C. Current Direction

Show the currently detected direction.

Example:

```text
Current Direction
SOUTH
```

### D. Current Heading

Show the current heading/angle when useful.

Example:

```text
Heading: 182°
```

### E. Movement/Stability Status

Clearly show whether the phone is currently moving or stable.

Example:

```text
Status: STABLE
```

or

```text
Status: MOVING
```

### F. Last Signal

Show the most recently confirmed/sent signal.

Example:

```text
Last Signal Sent: 3
```

### G. Transmission Status

Show whether the signal was successfully transmitted.

For example:

```text
Signal: 3
HTTP: 200
Status: Sent
```

or an appropriate failure status.

I must be able to see inside the application what signal is being sent without having to repeatedly open/check the external endpoint.

---

# 9. BACKGROUND OPERATION

This is a critical requirement.

After I open the application and enable the background/always-running option, the application should continue monitoring the direction in the background.

The intended behavior is:

```text
Open App
→ Configure URL
→ Enable Background Operation
→ Close app UI
→ Application continues operating
→ Phone continues monitoring direction
→ Stable direction detected
→ Signal sent
```

The implementation must use the **proper Android-supported background execution mechanism**, rather than an unreliable hack.

Investigate the current Android requirements for long-running sensor/background operation.

If Android requires a foreground service, persistent notification, battery optimization exemption, or specific service configuration for reliable continuous operation, implement the proper mechanism.

Do not simply claim that an Android application can run indefinitely after being force-stopped by the user.

Distinguish between:

* App UI being closed/minimized.
* Screen being turned off/locked.
* Normal background operation.
* Android stopping/restricting the service.
* User explicitly force-stopping the application.

The goal is reliable continuous operation under normal Android-supported conditions.

---

# 10. PHONE SCREEN OFF / LOCKED

When the phone screen is turned off or locked, the background system should continue operating if the Android device permits the required sensor/service behavior.

The application must be designed specifically for this use case.

Verify the behavior instead of assuming it works.

---

# 11. REQUIRED PERMISSIONS AND SETTINGS

Identify every Android permission and system setting actually required for this application.

Do not request unnecessary permissions.

When the user opens the application, the application should clearly detect missing permissions/settings and guide the user to grant them.

Where Android provides an appropriate settings screen, provide a button that takes the user directly to the relevant system settings.

The application should explain what each permission/setting is required for.

Consider all permissions/settings relevant to:

* Sensors/orientation.
* Location if technically required by the chosen Android sensor/API implementation.
* Background operation.
* Foreground service.
* Notifications if required.
* Battery optimization/background restrictions where relevant.
* Network/Internet access.
* Any other permission genuinely required by the final architecture.

Do not request permissions simply because they might be useful.

Only use permissions required by the actual implementation.

---

# 12. PERMISSION FLOW

The user experience should be simple.

When I open the application:

```text
Open App
↓
Check required permissions/settings
↓
Show missing items
↓
User taps the relevant button
↓
Android system settings/permission screen opens
↓
User grants permission
↓
Return to application
↓
Application verifies the permission again
↓
Ready
```

Do not assume a permission was granted without checking it.

---

# 13. APP STATE

The application should properly maintain required configuration/state such as:

* Endpoint URL.
* Background service enabled/disabled state where appropriate.
* Last known/confirmed direction.
* Last sent signal.
* Transmission status.
* Relevant user configuration.

Use an appropriate Android persistence mechanism.

The endpoint URL should not disappear simply because the app UI is closed.

---

# 14. RELIABILITY AND RESPONSIVENESS

Responsiveness is extremely important.

I do not want this behavior:

```text
Rotate phone
→ wait 5 seconds
→ signal
```

The desired behavior is closer to:

```text
Rotate phone
→ reach target direction
→ become stable
→ approximately 1–2 seconds or less
→ signal sent
```

Optimize the sensor filtering and stability detection for low latency while still avoiding false triggers during rotation.

Do not sacrifice reliability just to make the delay extremely small.

Find a practical balance between:

* Stability
* False-trigger prevention
* Responsiveness
* Sensor noise
* Network latency

---

# 15. SENSOR CALIBRATION / COMPASS ACCURACY

Consider real-world compass problems such as:

* Magnetic interference.
* Sensor noise.
* Phone orientation.
* Device-specific sensor differences.
* Compass calibration.
* Heading smoothing/filtering.

If calibration is necessary, provide a simple user-facing indication/instruction.

Do not create unnecessary complexity.

The application should work on normal Android phones as broadly as practical.

---

# 16. COMPATIBILITY

This must be a **real distributable APK**, intended to work across a broad range of normal Android devices.

Do not build it only for one development phone.

Use appropriate Android APIs and compatibility practices.

Avoid unnecessary device-specific assumptions.

Where hardware limitations exist—for example, a phone lacking a required sensor—detect this and show a clear message instead of pretending the feature works.

---

# 17. LOGGING / DEBUG INFORMATION

Include appropriate internal logging for development and verification.

The logs should help verify:

* Raw/processed heading.
* Detected direction.
* Moving/stable state.
* Stability confirmation.
* Direction changes.
* Signal generation.
* HTTP request.
* HTTP response.
* Network errors.
* Service lifecycle.
* Permission/state problems.

Do not expose unnecessary technical information in the normal user UI.

---

# 18. UI DESIGN

Keep the design simple.

The application does NOT need a highly complicated custom interface.

Use:

* Clean layout.
* Clear typography.
* Clear direction/status indicators.
* Simple controls.
* Simple logo/icon.
* No unnecessary animations.
* No unnecessary customization.

Create a simple professional app icon/logo related to direction/compass/signal.

Do not spend excessive time on visual decoration.

Functionality and reliability are the priority.

---

# 19. NO PROTOTYPE / NO FAKE IMPLEMENTATION

This is NOT a prototype.

Do not create:

* Fake sensor data.
* Simulated direction detection.
* Mock signal sending.
* Fake HTTP success.
* Placeholder background service.
* Fake APK behavior.
* Hardcoded demonstration output pretending to be real.

Everything must be connected to the real Android sensors, real direction calculation, real background mechanism, and real HTTP endpoint.

The final APK must be genuinely usable.

---

# 20. DEVELOPMENT APPROACH

Before implementation, create a detailed task breakdown.

Do NOT attempt to implement everything as one huge task.

Break the project into small, manageable tasks.

Create approximately **30–40 small tasks** covering the complete development lifecycle.

For example, tasks should cover areas such as:

* Project setup.
* Architecture.
* Sensor implementation.
* Heading calculation.
* Filtering.
* Direction sectors.
* Stability detection.
* Signal mapping.
* Duplicate suppression.
* HTTP layer.
* JSON generation.
* URL configuration.
* UI.
* State persistence.
* Permission handling.
* Background service.
* Screen-off behavior.
* Battery/background handling.
* Logging.
* Testing.
* Build.
* GitHub Actions.
* APK verification.

You should determine the exact task breakdown yourself after understanding the project.

Do not start with a huge implementation task.

Complete the work progressively.

---

# 21. VERIFICATION MUST BE LAYER-BY-LAYER

Verification is mandatory.

Do not wait until the end to discover that something does not work.

Verify each major layer independently and then verify the complete system.

At minimum verify:

### Sensor Layer

* Heading values are actually coming from the phone.
* Heading changes when the phone rotates.
* Sensor behavior is reasonable.

### Direction Layer

* North is correctly classified.
* West is correctly classified.
* South is correctly classified.
* East is correctly classified.
* Sector boundaries work correctly.
* 0°/360° is handled correctly.

### Stability Layer

* Rotation does not immediately trigger signals.
* Stable positioning triggers detection.
* Sensor noise does not constantly change the direction.
* Stability detection is fast enough.

### Signal Layer

* North → `1`
* West → `2`
* South → `3`
* East → `4`

### Duplicate Prevention

* Same stable direction does not repeatedly send the same signal.
* Moving to a new direction and stabilizing sends the new signal.

### HTTP Layer

* Correct endpoint is used.
* Correct JSON is generated.
* Request is actually transmitted.
* HTTP success is detected.
* HTTP failure is detected.
* Timeout/error handling works.

### UI Layer

* Current direction is visible.
* Stability state is visible.
* Last signal is visible.
* Transmission status is visible.
* Endpoint can be configured.

### Permission Layer

* Missing permissions are detected.
* Permission flow works.
* Returning from Android settings is handled.
* Application verifies permission state again.

### Background Layer

* Service starts correctly.
* Application UI can be closed while the service continues.
* Screen lock/off behavior is tested.
* Direction monitoring continues.
* Signal transmission continues.
* Service restart behavior is investigated and verified where Android permits it.

### Final End-to-End Test

Perform a complete real-world flow:

```text
Open APK
→ Grant required permissions
→ Configure endpoint
→ Enable background operation
→ Rotate phone
→ Stop at North
→ Wait for stability
→ Verify signal 1

Rotate phone
→ Stop at West
→ Verify signal 2

Rotate phone
→ Stop at South
→ Verify signal 3

Rotate phone
→ Stop at East
→ Verify signal 4
```

Also test with the screen locked/off where applicable.

---

# 22. LATENCY VERIFICATION

Measure the actual behavior.

The goal is not simply to claim that it is fast.

Verify:

```text
Stable direction reached
→ Direction confirmed
→ Request generated
→ HTTP request sent
```

Measure/log the timing where practical.

Investigate any case where signal transmission takes significantly longer than the intended approximately 1–2 second target after stability.

Do not hide latency problems.

Fix them if they are caused by the application architecture.

Clearly distinguish application processing delay from external network/server delay.

---

# 23. GITHUB REPOSITORY

I will provide you with my personal GitHub access/token when it becomes necessary.

When access is available:

* Use a private GitHub repository.
* Do not expose the token.
* Do not hard-code the token into the project.
* Use GitHub Secrets where appropriate.
* Keep sensitive credentials out of source code and logs.

Do not push anything publicly.

---

# 24. GITHUB ACTIONS BUILD

The final APK must be built using **GitHub Actions**.

The goal is that I should not need to manually install the complete Android development environment locally just to build the APK.

You should configure the repository/workflow so that GitHub Actions can:

1. Set up the required Android build environment.
2. Resolve dependencies.
3. Build the application.
4. Run automated verification/tests where applicable.
5. Produce the APK as a GitHub Actions artifact.
6. Report build failures clearly.
7. Produce the final APK only after successful verification.

Do not simply create a source repository and tell me to build it locally.

The GitHub Actions build must actually be tested.

---

# 25. BUILD VERIFICATION

Before considering the project complete:

* Run the full build.
* Verify the APK is generated.
* Verify the generated APK is installable.
* Verify the application launches.
* Verify the required permissions appear.
* Verify the real sensor functionality.
* Verify the HTTP request functionality.
* Verify background operation.
* Verify the complete direction-to-signal flow.

If a physical Android phone is required for a specific verification step, clearly identify that step and ask me to perform the physical test.

Do not claim physical behavior is verified if you cannot physically test it.

---

# 26. PHYSICAL TESTING

If you need me to perform physical testing with my phone, tell me exactly:

* What I need to do.
* Which direction to point the phone.
* How long to keep it stable.
* What result I should see.
* What result you need from me.

I will help with physical testing when required.

However, do everything else independently.

Do not repeatedly ask me to perform tasks that can be verified through code/build/tests/GitHub Actions.

---

# 27. WORK INDEPENDENTLY

After I provide the required GitHub access:

Do the development, testing, verification, GitHub configuration, and GitHub Actions work independently.

Do not stop and ask me for confirmation for every small implementation decision.

Think like an experienced Android developer.

If something can be solved through code, configuration, testing, documentation, or GitHub Actions, handle it yourself.

Only involve me when:

* Physical phone testing is genuinely required.
* A real credential/access decision is required.
* A decision cannot technically be made without user input.

---

# 28. COMMUNICATION LANGUAGE

This instruction is written in English for clarity.

However, **communicate with me in Bangla throughout the development process.**

All progress updates, explanations, findings, test results, problems, and next steps should be communicated in Bangla.

Use technical English terms where necessary, but the overall communication should be Bangla.

---

# 29. PROGRESS UPDATES

Keep me updated throughout the work.

For each meaningful stage, tell me in Bangla:

* What you are currently doing.
* What you completed.
* What you verified.
* Whether the result passed or failed.
* What you are going to do next.

Do not disappear and perform a huge amount of work without explaining what is happening.

The updates should be concise but informative.

---

# 30. FINAL DELIVERABLE

The final result should include:

* Complete Android source code.
* Clean project structure.
* Simple professional UI.
* Simple app icon/logo.
* Real sensor-based direction detection.
* Stable-direction detection.
* 1/2/3/4 signal mapping.
* Configurable external endpoint.
* Real JSON HTTP transmission.
* Background operation.
* Required permission/settings handling.
* Screen-off/background support as permitted by Android.
* Proper error handling.
* Logging for verification.
* Automated/build configuration.
* GitHub Actions workflow.
* Successfully generated APK artifact.
* Verification results.

Most importantly:

**The final APK must be a genuinely working application, not a demonstration or prototype.**

---

# 31. STARTING INSTRUCTION

Now follow this exact order:

### Step 1

First, deeply analyze the complete requirements.

### Step 2

Reply to me in Bangla with a clear recap of what you understood.

### Step 3

Identify any technically important constraints or Android limitations that need to be considered.

### Step 4

Create a complete implementation plan.

### Step 5

Break the implementation into approximately 30–40 small ordered tasks.

### Step 6

Show me the task structure in Bangla.

### Step 7

After the plan is established, start implementing the tasks progressively.

### Step 8

Verify every major layer before moving forward.

### Step 9

Configure the private GitHub repository and GitHub Actions when GitHub access is provided.

### Step 10

Build the APK through GitHub Actions.

### Step 11

Perform complete verification.

### Step 12

If physical testing is required, give me the exact physical test procedure in Bangla.

### Step 13

Fix any issue discovered during testing.

### Step 14

Only consider the project complete when the complete end-to-end system has been verified as far as technically possible.

**Do not start coding before giving me the Bangla understanding recap and the structured plan.**
