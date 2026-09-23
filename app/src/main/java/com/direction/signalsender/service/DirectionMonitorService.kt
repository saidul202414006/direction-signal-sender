package com.direction.signalsender.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.media.AudioManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.direction.signalsender.R
import com.direction.signalsender.data.network.SignalApiClient
import com.direction.signalsender.data.preferences.PreferenceManager
import com.direction.signalsender.domain.dispatcher.SignalDispatcher
import com.direction.signalsender.domain.model.CardinalDirection
import com.direction.signalsender.domain.model.DirectionState
import com.direction.signalsender.domain.model.MotionStatus
import com.direction.signalsender.domain.model.TransmissionResult
import com.direction.signalsender.domain.stability.StabilityDetector
import com.direction.signalsender.sensor.OrientationSensorManager
import com.direction.signalsender.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class DirectionMonitorService : Service() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var preferenceManager: PreferenceManager
    private lateinit var sensorManager: OrientationSensorManager
    private lateinit var stabilityDetector: StabilityDetector
    private lateinit var signalDispatcher: SignalDispatcher
    private val apiClient = SignalApiClient()

    private var wakeLock: PowerManager.WakeLock? = null
    private lateinit var notificationManager: NotificationManager
    private var signalZeroJob: Job? = null

    // Volume Down hardware detector for background
    private lateinit var audioManager: AudioManager
    private var lastMediaVolume: Int = -1
    private var lastVolumeChangeTimestampMs: Long = 0L

    private val volumeReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == "android.media.VOLUME_CHANGED_ACTION") {
                val currentVol = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)
                val now = System.currentTimeMillis()
                // Check if volume decreased and debounce within 350ms
                if (lastMediaVolume != -1 && currentVol < lastMediaVolume && (now - lastVolumeChangeTimestampMs) > 350) {
                    lastVolumeChangeTimestampMs = now
                    toggleSignalZeroModeInternal()
                }
                lastMediaVolume = currentVol
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        preferenceManager = PreferenceManager(applicationContext)
        notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        createNotificationChannel()

        acquireWakeLock()

        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        lastMediaVolume = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)
        try {
            val filter = IntentFilter("android.media.VOLUME_CHANGED_ACTION")
            registerReceiver(volumeReceiver, filter)
        } catch (e: Exception) {
            // Ignore receiver registration failures on restricted vendor ROMs
        }

        stabilityDetector = StabilityDetector()
        signalDispatcher = SignalDispatcher { signalToSend ->
            onTriggerSignalTransmission(signalToSend)
        }

        // Restore last known state from prefs
        signalDispatcher.restoreState(
            preferenceManager.lastConfirmedDirection,
            preferenceManager.lastSentSignal
        )

        sensorManager = OrientationSensorManager(applicationContext) { rawAzimuth ->
            val result = stabilityDetector.addSample(rawAzimuth)

            // Existing direction-based signal logic is preserved without modification
            if (result.stableDirectionConfirmed != null) {
                signalDispatcher.onDirectionStabilized(result.stableDirectionConfirmed)
            }

            _serviceState.value = _serviceState.value.copy(
                azimuthDeg = result.smoothedAzimuth,
                direction = result.instantaneousSector,
                motionStatus = result.motionStatus,
                isServiceRunning = true,
                isSignalZeroMode = signalDispatcher.isSignalZeroMode,
                configuredUrl = preferenceManager.endpointUrl
            )

            updateNotification(
                result.instantaneousSector,
                result.motionStatus,
                _serviceState.value.lastSignalSent
            )
        }

        sensorManager.startListening()
        _serviceState.value = _serviceState.value.copy(
            isServiceRunning = true,
            direction = preferenceManager.lastConfirmedDirection ?: CardinalDirection.NORTH,
            lastConfirmedDirection = preferenceManager.lastConfirmedDirection,
            lastSignalSent = preferenceManager.lastSentSignal,
            isSignalZeroMode = false,
            configuredUrl = preferenceManager.endpointUrl
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_TOGGLE_SIGNAL_ZERO -> {
                toggleSignalZeroModeInternal()
                return START_STICKY
            }
        }

        startAsForeground()
        return START_STICKY
    }

    fun toggleSignalZeroModeInternal(): Boolean {
        val isNowZeroMode = signalDispatcher.toggleSignalZeroMode()
        preferenceManager.isSignalZeroMode = isNowZeroMode

        _serviceState.value = _serviceState.value.copy(
            isSignalZeroMode = isNowZeroMode
        )

        if (isNowZeroMode) {
            startContinuousSignalZeroLoop()
        } else {
            stopContinuousSignalZeroLoop()
        }

        updateNotification(
            _serviceState.value.direction,
            _serviceState.value.motionStatus,
            _serviceState.value.lastSignalSent
        )

        return isNowZeroMode
    }

    private fun startContinuousSignalZeroLoop() {
        signalZeroJob?.cancel()
        signalZeroJob = serviceScope.launch {
            while (isActive && signalDispatcher.isSignalZeroMode) {
                val endpoint = preferenceManager.endpointUrl
                _serviceState.value = _serviceState.value.copy(
                    lastSignalSent = 0,
                    lastTransmission = TransmissionResult.InFlight(0)
                )

                val result = apiClient.sendSignal(endpoint, 0)
                preferenceManager.lastSentSignal = 0
                preferenceManager.lastTransmissionText = when (result) {
                    is TransmissionResult.Success -> result.toDisplayText()
                    is TransmissionResult.Failure -> result.toDisplayText()
                    else -> ""
                }

                _serviceState.value = _serviceState.value.copy(
                    lastSignalSent = 0,
                    lastTransmission = result
                )

                updateNotification(
                    _serviceState.value.direction,
                    _serviceState.value.motionStatus,
                    0
                )

                // Continuous transmission interval (~1000ms)
                delay(1000L)
            }
        }
    }

    private fun stopContinuousSignalZeroLoop() {
        signalZeroJob?.cancel()
        signalZeroJob = null

        // Resume normal direction logic
        _serviceState.value = _serviceState.value.copy(
            isSignalZeroMode = false
        )

        // Clear last confirmed direction in dispatcher so the current direction
        // will be transmitted immediately when confirmed stable
        signalDispatcher.restoreState(null, null)
    }

    private fun startAsForeground() {
        val notification = buildNotification(
            direction = _serviceState.value.direction,
            motion = _serviceState.value.motionStatus,
            lastSignal = _serviceState.value.lastSignalSent
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun onTriggerSignalTransmission(signal: Int) {
        val endpoint = preferenceManager.endpointUrl
        val direction = CardinalDirection.fromSignal(signal)

        preferenceManager.lastSentSignal = signal
        preferenceManager.lastConfirmedDirection = direction

        _serviceState.value = _serviceState.value.copy(
            lastConfirmedDirection = direction,
            lastSignalSent = signal,
            lastTransmission = TransmissionResult.InFlight(signal)
        )

        serviceScope.launch {
            val result = apiClient.sendSignal(endpoint, signal)
            preferenceManager.lastTransmissionText = when (result) {
                is TransmissionResult.Success -> result.toDisplayText()
                is TransmissionResult.Failure -> result.toDisplayText()
                else -> ""
            }

            _serviceState.value = _serviceState.value.copy(
                lastTransmission = result
            )
        }
    }

    private fun acquireWakeLock() {
        try {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "DirectionMonitor::ServiceWakeLock"
            ).apply {
                setReferenceCounted(false)
                acquire(24 * 60 * 60 * 1000L) // 24-hour safeguard
            }
        } catch (e: Exception) {
            // WakeLock permission or acquisition issue logged
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
        } catch (e: Exception) {
            // Ignore release exceptions
        }
        wakeLock = null
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Direction Signal Monitor",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Continuous background compass direction detection & HTTP signaling"
                setShowBadge(false)
            }
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(
        direction: CardinalDirection,
        motion: MotionStatus,
        lastSignal: Int?
    ): Notification {
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val toggleZeroIntent = Intent(this, DirectionMonitorService::class.java).apply {
            action = ACTION_TOGGLE_SIGNAL_ZERO
        }
        val toggleZeroPendingIntent = PendingIntent.getService(
            this,
            1,
            toggleZeroIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val isZeroMode = signalDispatcher.isSignalZeroMode
        val title = if (isZeroMode) "[SIGNAL 0 ACTIVE] Direction Paused" else "Direction Monitor Active"
        val contentText = if (isZeroMode) {
            "Sending Signal 0 continuously | Press Vol-Down to resume"
        } else {
            "Facing ${direction.displayName} (${motion.displayName}) | Last Signal: ${lastSignal ?: "None"}"
        }

        val toggleActionTitle = if (isZeroMode) "Resume Normal (Vol-)" else "Enable Signal 0 (Vol-)"

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(contentText)
            .setSmallIcon(R.drawable.ic_stat_compass)
            .setContentIntent(pendingIntent)
            .addAction(R.drawable.ic_stat_compass, toggleActionTitle, toggleZeroPendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun updateNotification(
        direction: CardinalDirection,
        motion: MotionStatus,
        lastSignal: Int?
    ) {
        notificationManager.notify(
            NOTIFICATION_ID,
            buildNotification(direction, motion, lastSignal)
        )
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            unregisterReceiver(volumeReceiver)
        } catch (e: Exception) {
            // Receiver might not be registered
        }
        sensorManager.stopListening()
        signalZeroJob?.cancel()
        releaseWakeLock()
        serviceScope.cancel()

        preferenceManager.isServiceEnabled = false
        _serviceState.value = _serviceState.value.copy(
            isServiceRunning = false,
            isSignalZeroMode = false
        )
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val CHANNEL_ID = "direction_monitor_service_channel"
        const val NOTIFICATION_ID = 1001
        const val ACTION_START = "com.direction.signalsender.action.START"
        const val ACTION_STOP = "com.direction.signalsender.action.STOP"
        const val ACTION_TOGGLE_SIGNAL_ZERO = "com.direction.signalsender.action.TOGGLE_SIGNAL_ZERO"

        private val _serviceState = MutableStateFlow(DirectionState())
        val serviceState: StateFlow<DirectionState> = _serviceState.asStateFlow()

        fun start(context: Context) {
            val intent = Intent(context, DirectionMonitorService::class.java).apply {
                action = ACTION_START
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, DirectionMonitorService::class.java).apply {
                action = ACTION_STOP
            }
            context.stopService(intent)
        }

        fun toggleSignalZeroMode(context: Context) {
            val intent = Intent(context, DirectionMonitorService::class.java).apply {
                action = ACTION_TOGGLE_SIGNAL_ZERO
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }
}
