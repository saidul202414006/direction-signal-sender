# Rule 03: Networking, HTTP Client & JSON Payload

## 1. External URL Configuration
The endpoint URL is fully user-configurable from the Android application interface.
- It must be persisted across application restarts using `EncryptedSharedPreferences` or Jetpack `DataStore`.
- Input validation: Verify scheme (`http://` or `https://`) and valid host formatting before allowing connection attempts.
- Do not hardcode a single production endpoint into source code.

---

## 2. JSON Payload Specification
When a stable direction is confirmed, the application sends a standard `POST` request with `Content-Type: application/json; charset=utf-8`.

The JSON payload structure must match the specification:
```json
{
  "signal": 1
}
```

### Signal Values
- North: `{"signal": 1}`
- West: `{"signal": 2}`
- South: `{"signal": 3}`
- East: `{"signal": 4}`

*(No auxiliary fields, nested objects, or wrappers unless explicitly configured).*

---

## 3. Asynchronous Non-Blocking Architecture
- **CRITICAL**: Network requests MUST NEVER execute on the main UI thread or the sensor callback thread (`onSensorChanged`).
- Sensor processing and stability evaluation must run without jitter or blocking while an HTTP request is in-flight.
- Use Kotlin Coroutines (`Dispatchers.IO`) with `OkHttpClient`.

```kotlin
// Threading & Network Architecture
val client = OkHttpClient.Builder()
    .connectTimeout(5, TimeUnit.SECONDS)
    .readTimeout(5, TimeUnit.SECONDS)
    .writeTimeout(5, TimeUnit.SECONDS)
    .retryOnConnectionFailure(false)
    .build()

suspend fun sendSignal(url: String, signal: Int): TransmissionResult = withContext(Dispatchers.IO) {
    val json = "{\"signal\":$signal}"
    val requestBody = json.toRequestBody("application/json; charset=utf-8".toMediaType())
    val request = Request.Builder()
        .url(url)
        .post(requestBody)
        .build()

    try {
        client.newCall(request).execute().use { response ->
            TransmissionResult.Success(
                signal = signal,
                httpCode = response.code,
                timestamp = System.currentTimeMillis()
            )
        }
    } catch (e: Exception) {
        TransmissionResult.Failure(
            signal = signal,
            errorMessage = e.message ?: "Unknown network error",
            timestamp = System.currentTimeMillis()
        )
    }
}
```

---

## 4. Transmission Status Reporting
The application UI and logs must reflect the exact outcome of every transmission:
- **Success State**: `Signal: <N> | HTTP: <code (e.g. 200)> | Status: Sent`
- **Failure State**: `Signal: <N> | Status: Failed (<Error message / timeout>)`
- In-flight indicator during transmission.
- Timestamps logged to internal debug memory buffer so the user can verify transmission without checking their backend server.
