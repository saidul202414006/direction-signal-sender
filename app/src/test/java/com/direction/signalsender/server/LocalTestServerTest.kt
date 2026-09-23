package com.direction.signalsender.server

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.TimeUnit

class LocalTestServerTest {

    private val client = OkHttpClient.Builder()
        .connectTimeout(3, TimeUnit.SECONDS)
        .readTimeout(3, TimeUnit.SECONDS)
        .build()

    private var port = 0

    @Before
    fun setup() {
        port = LocalTestServer.start(preferredPort = 0) // dynamic port
        LocalTestServer.clearHistory()
    }

    @After
    fun teardown() {
        LocalTestServer.stop()
    }

    @Test
    fun `test LocalTestServer receives JSON POST signal and responds 200 OK`() {
        assertTrue("Server should be running", LocalTestServer.isRunning)

        val json = "{\"signal\":3}"
        val body = json.toRequestBody("application/json".toMediaType())
        val request = Request.Builder()
            .url("http://127.0.0.1:$port/api/signal")
            .post(body)
            .build()

        val response = client.newCall(request).execute()
        assertEquals(200, response.code)

        val responseBody = response.body?.string().orEmpty()
        val jsonResponse = JSONObject(responseBody)
        assertEquals("success", jsonResponse.getString("status"))
        assertEquals(3, jsonResponse.getJSONObject("received").getInt("signal"))

        // Verify latest signal in memory
        assertNotNull(LocalTestServer.latestSignal)
        assertEquals(3, LocalTestServer.latestSignal?.signal)
        assertEquals(1, LocalTestServer.history.size)
    }

    @Test
    fun `test LocalTestServer api latest endpoint returns correct JSON`() {
        // Send signal 2
        val json = "{\"signal\":2}"
        val body = json.toRequestBody("application/json".toMediaType())
        client.newCall(Request.Builder().url("http://127.0.0.1:$port/api/direction").post(body).build()).execute()

        // Query /api/latest
        val getRequest = Request.Builder().url("http://127.0.0.1:$port/api/latest").get().build()
        val response = client.newCall(getRequest).execute()
        assertEquals(200, response.code)

        val responseJson = JSONObject(response.body?.string().orEmpty())
        val latest = responseJson.getJSONObject("latest")
        assertEquals(2, latest.getInt("signal"))
        assertEquals(1, responseJson.getInt("totalReceived"))
    }
}
