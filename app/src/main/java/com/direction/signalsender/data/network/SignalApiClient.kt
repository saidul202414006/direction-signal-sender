package com.direction.signalsender.data.network

import com.direction.signalsender.domain.model.SignalPayload
import com.direction.signalsender.domain.model.TransmissionResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

class SignalApiClient(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .writeTimeout(5, TimeUnit.SECONDS)
        .retryOnConnectionFailure(false)
        .build()
) {
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    suspend fun sendSignal(endpointUrl: String, signal: Int): TransmissionResult = withContext(Dispatchers.IO) {
        if (endpointUrl.isBlank() || (!endpointUrl.startsWith("http://") && !endpointUrl.startsWith("https://"))) {
            return@withContext TransmissionResult.Failure(
                signal = signal,
                errorMessage = "Invalid endpoint URL scheme (must start with http:// or https://)"
            )
        }

        val payload = SignalPayload(signal).toJson()
        val body = payload.toRequestBody(jsonMediaType)
        val request = Request.Builder()
            .url(endpointUrl)
            .post(body)
            .header("User-Agent", "DirectionSignalSender/1.0")
            .build()

        try {
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    TransmissionResult.Success(
                        signal = signal,
                        httpCode = response.code,
                        timestamp = System.currentTimeMillis()
                    )
                } else {
                    TransmissionResult.Failure(
                        signal = signal,
                        errorMessage = "HTTP Error ${response.code}: ${response.message}",
                        httpCode = response.code,
                        timestamp = System.currentTimeMillis()
                    )
                }
            }
        } catch (e: IOException) {
            TransmissionResult.Failure(
                signal = signal,
                errorMessage = e.message ?: "Network I/O failure",
                timestamp = System.currentTimeMillis()
            )
        } catch (e: Exception) {
            TransmissionResult.Failure(
                signal = signal,
                errorMessage = "Unexpected error: ${e.message}",
                timestamp = System.currentTimeMillis()
            )
        }
    }
}
