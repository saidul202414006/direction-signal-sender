package com.direction.signalsender.server

import android.content.Context
import android.net.wifi.WifiManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.PrintWriter
import java.net.InetAddress
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.Socket
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.CopyOnWriteArrayList

object LocalTestServer {

    data class ReceivedSignal(
        val signal: Int,
        val rawJson: String,
        val timestamp: Long = System.currentTimeMillis(),
        val clientIp: String = "127.0.0.1"
    ) {
        val formattedTime: String
            get() = SimpleDateFormat("HH:mm:ss.SSS", Locale.getDefault()).format(Date(timestamp))
    }

    private var serverSocket: ServerSocket? = null
    private var serverJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO)

    val history = CopyOnWriteArrayList<ReceivedSignal>()
    var latestSignal: ReceivedSignal? = null
        private set

    var actualPort: Int = 8080
        private set

    val isRunning: Boolean
        get() = serverSocket != null && !serverSocket!!.isClosed

    @Synchronized
    fun start(preferredPort: Int = 8080): Int {
        if (isRunning) return actualPort

        val portsToTry = listOf(preferredPort, 8081, 8888, 9090)
        for (p in portsToTry) {
            try {
                serverSocket = ServerSocket(p)
                actualPort = p
                break
            } catch (e: Exception) {
                // Try next port
            }
        }

        if (serverSocket == null) {
            try {
                serverSocket = ServerSocket(0) // Random available port
                actualPort = serverSocket!!.localPort
            } catch (e: Exception) {
                return -1
            }
        }

        serverJob = scope.launch {
            while (isActive && serverSocket != null && !serverSocket!!.isClosed) {
                try {
                    val client = serverSocket!!.accept()
                    launch {
                        handleClient(client)
                    }
                } catch (e: Exception) {
                    // Socket closed or timeout
                }
            }
        }

        return actualPort
    }

    @Synchronized
    fun stop() {
        try {
            serverSocket?.close()
        } catch (e: Exception) {
            // Ignore
        }
        serverSocket = null
        serverJob?.cancel()
        serverJob = null
    }

    fun clearHistory() {
        history.clear()
        latestSignal = null
    }

    private fun handleClient(socket: Socket) {
        try {
            socket.soTimeout = 4000
            val clientIp = socket.inetAddress?.hostAddress ?: "127.0.0.1"
            val reader = BufferedReader(InputStreamReader(socket.getInputStream()))
            val writer = PrintWriter(socket.getOutputStream(), true)

            val requestLine = reader.readLine() ?: return
            val parts = requestLine.split(" ")
            if (parts.size < 2) return

            val method = parts[0]
            val path = parts[1]

            // Read headers to determine Content-Length
            var contentLength = 0
            var line: String? = reader.readLine()
            while (!line.isNullOrEmpty()) {
                if (line.lowercase(Locale.ROOT).startsWith("content-length:")) {
                    contentLength = line.substring(15).trim().toIntOrNull() ?: 0
                }
                line = reader.readLine()
            }

            if (method.equals("POST", ignoreCase = true)) {
                // Read JSON body
                val bodyChars = CharArray(contentLength)
                var readTotal = 0
                while (readTotal < contentLength) {
                    val read = reader.read(bodyChars, readTotal, contentLength - readTotal)
                    if (read == -1) break
                    readTotal += read
                }
                val rawBody = String(bodyChars)

                var signalVal = -1
                try {
                    val json = JSONObject(rawBody)
                    if (json.has("signal")) {
                        signalVal = json.getInt("signal")
                    }
                } catch (e: Exception) {
                    // Parse fallback
                }

                if (signalVal != -1) {
                    val item = ReceivedSignal(
                        signal = signalVal,
                        rawJson = rawBody,
                        clientIp = clientIp
                    )
                    latestSignal = item
                    history.add(0, item)
                    if (history.size > 100) {
                        history.removeAt(history.size - 1)
                    }
                }

                val responseJson = "{\"status\":\"success\",\"received\":{\"signal\":$signalVal}}"
                sendResponse(writer, 200, "OK", "application/json", responseJson)

            } else if (path.startsWith("/api/latest")) {
                // Return latest signal and history as JSON
                val root = JSONObject()
                val latestObj = latestSignal?.let {
                    JSONObject().apply {
                        put("signal", it.signal)
                        put("timestamp", it.timestamp)
                        put("formattedTime", it.formattedTime)
                        put("rawJson", it.rawJson)
                    }
                }
                root.put("latest", latestObj ?: JSONObject.NULL)
                root.put("totalReceived", history.size)

                sendResponse(writer, 200, "OK", "application/json", root.toString())

            } else if (path.startsWith("/api/clear")) {
                clearHistory()
                sendResponse(writer, 200, "OK", "application/json", "{\"status\":\"cleared\"}")

            } else {
                // Serve Live Web Dashboard
                val html = generateDashboardHtml()
                sendResponse(writer, 200, "OK", "text/html; charset=utf-8", html)
            }

            socket.close()
        } catch (e: Exception) {
            try {
                socket.close()
            } catch (ignored: Exception) {}
        }
    }

    private fun sendResponse(
        writer: PrintWriter,
        statusCode: Int,
        statusText: String,
        contentType: String,
        content: String
    ) {
        val bytes = content.toByteArray(Charsets.UTF_8)
        writer.print("HTTP/1.1 $statusCode $statusText\r\n")
        writer.print("Content-Type: $contentType\r\n")
        writer.print("Content-Length: ${bytes.size}\r\n")
        writer.print("Access-Control-Allow-Origin: *\r\n")
        writer.print("Connection: close\r\n\r\n")
        writer.print(content)
        writer.flush()
    }

    fun getLocalIpAddress(context: Context): String {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val iface = interfaces.nextElement()
                val addresses = iface.inetAddresses
                while (addresses.hasMoreElements()) {
                    val addr = addresses.nextElement()
                    if (!addr.isLoopbackAddress && addr is java.net.Inet4Address) {
                        return addr.hostAddress ?: "127.0.0.1"
                    }
                }
            }
        } catch (e: Exception) {}
        return "127.0.0.1"
    }

    private fun generateDashboardHtml(): String {
        return """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Direction Signal Sender - Live Test Endpoint</title>
    <style>
        :root {
            --bg: #0B0F17;
            --surface: #161E2E;
            --surface-card: #1E293B;
            --accent: #0284C7;
            --accent-light: #38BDF8;
            --text-main: #F8FAFC;
            --text-muted: #94A3B8;
            --green: #10B981;
            --amber: #F59E0B;
            --red: #EF4444;
            --border: #334155;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
            background: var(--bg);
            color: var(--text-main);
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        .container {
            max-width: 680px;
            width: 100%;
        }
        header {
            text-align: center;
            margin-bottom: 24px;
        }
        h1 {
            font-size: 22px;
            color: var(--accent-light);
            margin-bottom: 6px;
        }
        .sub {
            color: var(--text-muted);
            font-size: 13px;
        }
        .card {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 14px;
            padding: 20px;
            margin-bottom: 18px;
        }
        .signal-hero {
            text-align: center;
            padding: 24px 16px;
        }
        .signal-number {
            font-size: 72px;
            font-weight: 800;
            color: var(--accent-light);
            line-height: 1;
            margin: 12px 0;
            font-family: monospace;
        }
        .badge {
            display: inline-block;
            padding: 6px 14px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.5px;
        }
        .badge-north { background: rgba(56,189,248,0.2); color: #38BDF8; border: 1px solid #38BDF8; }
        .badge-west { background: rgba(168,85,247,0.2); color: #A855F7; border: 1px solid #A855F7; }
        .badge-south { background: rgba(16,185,129,0.2); color: #10B981; border: 1px solid #10B981; }
        .badge-east { background: rgba(245,158,11,0.2); color: #F59E0B; border: 1px solid #F59E0B; }
        .badge-zero { background: rgba(239,68,68,0.2); color: #EF4444; border: 1px solid #EF4444; }
        .badge-none { background: rgba(148,163,184,0.2); color: #94A3B8; border: 1px solid #94A3B8; }

        .json-preview {
            background: #06090E;
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 14px;
            font-family: 'Courier New', Courier, monospace;
            font-size: 15px;
            color: #38BDF8;
            margin-top: 14px;
            text-align: left;
            overflow-x: auto;
        }
        .history-list {
            max-height: 320px;
            overflow-y: auto;
            margin-top: 12px;
        }
        .history-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 12px;
            background: var(--surface-card);
            border-radius: 8px;
            margin-bottom: 8px;
            font-size: 13px;
            border-left: 4px solid var(--accent);
        }
        .btn-clear {
            background: transparent;
            border: 1px solid var(--border);
            color: var(--text-muted);
            padding: 6px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
        }
        .btn-clear:hover {
            color: var(--text-main);
            border-color: var(--text-muted);
        }
        .live-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--green);
            display: inline-block;
            margin-right: 6px;
            animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
            0% { transform: scale(0.95); opacity: 0.6; }
            50% { transform: scale(1.2); opacity: 1; }
            100% { transform: scale(0.95); opacity: 0.6; }
        }
    </style>
</head>
<body>
<div class="container">
    <header>
        <h1><span class="live-dot"></span>Live Signal Test Endpoint</h1>
        <p class="sub">Built-in Receiver & Verification Dashboard</p>
    </header>

    <!-- Latest Signal Card -->
    <div class="card signal-hero">
        <div style="font-size: 12px; letter-spacing: 1px; color: var(--text-muted); font-weight: 700;">CURRENT RECEIVED SIGNAL</div>
        <div id="signalNum" class="signal-number">--</div>
        <div><span id="signalBadge" class="badge badge-none">WAITING FOR SIGNAL...</span></div>
        <div class="json-preview">
            <span style="color: #64748B;">// Exact Incoming JSON Format:</span><br>
            <span id="jsonDisplay">{\n  "signal": --\n}</span>
        </div>
        <div id="lastReceivedTime" style="margin-top: 10px; font-size: 12px; color: var(--text-muted);">Last Updated: Never</div>
    </div>

    <!-- Feed History -->
    <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 14px; font-weight: 700;">Signal Feed History</span>
            <button class="btn-clear" onclick="clearFeed()">Clear Feed</button>
        </div>
        <div id="historyList" class="history-list">
            <div style="color: var(--text-muted); font-size: 12px; text-align: center; padding: 20px;">No incoming signals received yet. Point the phone or press Volume Down to test.</div>
        </div>
    </div>
</div>

<script>
    let lastTimestamp = 0;
    const directionNames = {
        0: 'SIGNAL 0 (PAUSE MODE)',
        1: 'NORTH',
        2: 'WEST',
        3: 'SOUTH',
        4: 'EAST'
    };
    const badgeClasses = {
        0: 'badge-zero',
        1: 'badge-north',
        2: 'badge-west',
        3: 'badge-south',
        4: 'badge-east'
    };

    async function pollLatest() {
        try {
            const res = await fetch('/api/latest');
            const data = await res.json();
            if (data.latest && data.latest.timestamp !== lastTimestamp) {
                lastTimestamp = data.latest.timestamp;
                renderLatest(data.latest);
            }
        } catch (e) {
            // Ignore temporary network errors
        }
    }

    function renderLatest(item) {
        document.getElementById('signalNum').innerText = item.signal;
        const dirName = directionNames[item.signal] || 'UNKNOWN';
        const badge = document.getElementById('signalBadge');
        badge.innerText = dirName + ' (Signal ' + item.signal + ')';
        badge.className = 'badge ' + (badgeClasses[item.signal] || 'badge-none');

        document.getElementById('jsonDisplay').innerText = JSON.stringify({ signal: item.signal }, null, 2);
        document.getElementById('lastReceivedTime').innerText = 'Last Updated: ' + item.formattedTime;

        // Add to history list UI
        const list = document.getElementById('historyList');
        if (list.querySelector('.history-item') === null) {
            list.innerHTML = '';
        }
        const row = document.createElement('div');
        row.className = 'history-item';
        row.innerHTML = '<div><strong>' + dirName + '</strong> <code style="color: #38BDF8; margin-left: 8px;">{"signal": ' + item.signal + '}</code></div><span style="color: var(--text-muted);">' + item.formattedTime + '</span>';
        list.insertBefore(row, list.firstChild);
    }

    async function clearFeed() {
        try {
            await fetch('/api/clear');
            document.getElementById('signalNum').innerText = '--';
            document.getElementById('signalBadge').innerText = 'WAITING FOR SIGNAL...';
            document.getElementById('signalBadge').className = 'badge badge-none';
            document.getElementById('jsonDisplay').innerText = '{\\n  "signal": --\\n}';
            document.getElementById('lastReceivedTime').innerText = 'Last Updated: Never';
            document.getElementById('historyList').innerHTML = '<div style="color: var(--text-muted); font-size: 12px; text-align: center; padding: 20px;">Feed cleared. Waiting for new signals...</div>';
            lastTimestamp = 0;
        } catch (e) {}
    }

    // Auto-poll every 350ms for instant real-time updates
    setInterval(pollLatest, 350);
</script>
</body>
</html>
        """.trimIndent()
    }
}
