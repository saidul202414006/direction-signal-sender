package com.direction.signalsender.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.KeyEvent
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.direction.signalsender.R
import com.direction.signalsender.data.preferences.PreferenceManager
import com.direction.signalsender.databinding.ActivityMainBinding
import com.direction.signalsender.domain.model.CardinalDirection
import com.direction.signalsender.domain.model.MotionStatus
import com.direction.signalsender.domain.model.TransmissionResult
import com.direction.signalsender.server.LocalTestServer
import com.direction.signalsender.service.DirectionMonitorService
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var preferenceManager: PreferenceManager

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        checkAndDisplayPermissionStatus()
        if (isGranted && binding.switchBackgroundService.isChecked) {
            DirectionMonitorService.start(this)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        preferenceManager = PreferenceManager(this)

        setupEndpointConfig()
        setupTestEndpointUI()
        setupServiceToggle()
        setupSignalZeroToggle()
        setupPermissionActions()
        observeServiceState()
    }

    override fun onResume() {
        super.onResume()
        checkAndDisplayPermissionStatus()
        updateTestEndpointUrls()
    }

    private fun setupTestEndpointUI() {
        LocalTestServer.start()
        updateTestEndpointUrls()

        binding.btnSetTestEndpoint.setOnClickListener {
            val port = LocalTestServer.actualPort
            val localEndpoint = "http://127.0.0.1:$port/api/signal"
            binding.etEndpointUrl.setText(localEndpoint)
            preferenceManager.endpointUrl = localEndpoint
            binding.tilEndpoint.error = null
            Toast.makeText(this, "Test endpoint set & saved!", Toast.LENGTH_SHORT).show()
        }

        binding.btnOpenTestDashboard.setOnClickListener {
            val port = LocalTestServer.actualPort
            val dashboardUrl = "http://127.0.0.1:$port/"
            try {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(dashboardUrl))
                startActivity(intent)
            } catch (e: Exception) {
                Toast.makeText(this, "Unable to open browser: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun updateTestEndpointUrls() {
        val port = LocalTestServer.actualPort
        val localEndpoint = "http://127.0.0.1:$port/api/signal"
        val lanIp = LocalTestServer.getLocalIpAddress(this)

        binding.tvTestEndpointUrl.text = localEndpoint
        binding.tvLanTestUrl.text = "Wi-Fi PC URL: http://$lanIp:$port/"
    }

    /**
     * Intercepts hardware Volume Down button to toggle Signal-0 mode.
     * 1st click: Signal 0 ON (pauses direction signals, sends 0 continuously)
     * 2nd click: Signal 0 OFF (resumes normal direction-based signals)
     */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                DirectionMonitorService.toggleSignalZeroMode(this)
                return true // Consume key event so system volume does not change
            }
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    private fun setupEndpointConfig() {
        binding.etEndpointUrl.setText(preferenceManager.endpointUrl)

        binding.btnSaveUrl.setOnClickListener {
            val enteredUrl = binding.etEndpointUrl.text?.toString()?.trim().orEmpty()
            if (enteredUrl.startsWith("http://") || enteredUrl.startsWith("https://")) {
                preferenceManager.endpointUrl = enteredUrl
                binding.tilEndpoint.error = null
                Toast.makeText(this, R.string.url_saved, Toast.LENGTH_SHORT).show()
            } else {
                binding.tilEndpoint.error = getString(R.string.invalid_url)
            }
        }
    }

    private fun setupServiceToggle() {
        binding.switchBackgroundService.setOnCheckedChangeListener { _, isChecked ->
            if (isChecked) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                    ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                ) {
                    notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                } else {
                    DirectionMonitorService.start(this)
                }
            } else {
                DirectionMonitorService.stop(this)
            }
        }
    }

    private fun setupSignalZeroToggle() {
        binding.btnToggleSignalZero.setOnClickListener {
            DirectionMonitorService.toggleSignalZeroMode(this)
        }

        binding.btnAccessibilitySettings.setOnClickListener {
            try {
                val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                startActivity(intent)
                Toast.makeText(this, "Enable 'Direction Sender Volume Key Controller' for screen-off key capture", Toast.LENGTH_LONG).show()
            } catch (e: Exception) {
                openAppDetailsSettings()
            }
        }
    }

    private fun setupPermissionActions() {
        binding.btnNotificationPermission.setOnClickListener {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            } else {
                openAppDetailsSettings()
            }
        }

        binding.btnBatteryOptimization.setOnClickListener {
            try {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:$packageName")
                }
                startActivity(intent)
            } catch (e: Exception) {
                openAppDetailsSettings()
            }
        }
    }

    private fun openAppDetailsSettings() {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.fromParts("package", packageName, null)
        }
        startActivity(intent)
    }

    private fun checkAndDisplayPermissionStatus() {
        val missingNotification = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED

        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        val isBatteryExempt = powerManager.isIgnoringBatteryOptimizations(packageName)

        if (missingNotification || !isBatteryExempt) {
            binding.cardPermissions.visibility = View.VISIBLE
            binding.btnNotificationPermission.visibility = if (missingNotification) View.VISIBLE else View.GONE
            binding.btnBatteryOptimization.visibility = if (!isBatteryExempt) View.VISIBLE else View.GONE
        } else {
            binding.cardPermissions.visibility = View.GONE
        }
    }

    private fun observeServiceState() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                DirectionMonitorService.serviceState.collect { state ->
                    // Service switch state
                    if (binding.switchBackgroundService.isChecked != state.isServiceRunning) {
                        binding.switchBackgroundService.isChecked = state.isServiceRunning
                    }
                    binding.tvServiceStatus.text = if (state.isServiceRunning) {
                        getString(R.string.service_running)
                    } else {
                        getString(R.string.service_stopped)
                    }

                    // Signal-0 Mode UI state
                    if (state.isSignalZeroMode) {
                        binding.tvSignalZeroBadge.text = "ACTIVE (0)"
                        binding.tvSignalZeroBadge.setTextColor(Color.WHITE)
                        binding.tvSignalZeroBadge.setBackgroundColor(Color.parseColor("#DC2626"))
                        binding.btnToggleSignalZero.text = "Disable Signal 0 (Vol-)"

                        binding.tvMotionStatus.text = "STATUS: SIGNAL-0 ACTIVE"
                        binding.tvMotionStatus.setBackgroundColor(Color.parseColor("#DC2626"))
                    } else {
                        binding.tvSignalZeroBadge.text = "OFF"
                        binding.tvSignalZeroBadge.setTextColor(Color.parseColor("#94A3B8"))
                        binding.tvSignalZeroBadge.setBackgroundColor(Color.parseColor("#334155"))
                        binding.btnToggleSignalZero.text = "Enable Signal 0 (Vol-)"

                        // Normal Motion Badge
                        when (state.motionStatus) {
                            MotionStatus.STABLE -> {
                                binding.tvMotionStatus.text = "STATUS: STABLE"
                                binding.tvMotionStatus.setBackgroundColor(Color.parseColor("#10B981"))
                            }
                            MotionStatus.MOVING -> {
                                binding.tvMotionStatus.text = "STATUS: MOVING"
                                binding.tvMotionStatus.setBackgroundColor(Color.parseColor("#F59E0B"))
                            }
                            MotionStatus.UNKNOWN -> {
                                binding.tvMotionStatus.text = "STATUS: CALIBRATING"
                                binding.tvMotionStatus.setBackgroundColor(Color.parseColor("#475569"))
                            }
                        }
                    }

                    // Direction & Heading
                    if (state.isSignalZeroMode) {
                        binding.tvCurrentDirection.text = "SIGNAL 0"
                        binding.tvCurrentHeading.text = "Heading: ${state.azimuthDeg.toInt()}° (Paused)"
                    } else {
                        binding.tvCurrentDirection.text = state.direction.displayName
                        binding.tvCurrentHeading.text = "Heading: ${state.azimuthDeg.toInt()}°"
                    }

                    // Last Signal Sent
                    val lastSignalText = if (state.lastSignalSent != null) {
                        if (state.lastSignalSent == 0) {
                            "Last Signal Sent: 0 (SIGNAL-0 MODE)"
                        } else {
                            val dir = CardinalDirection.fromSignal(state.lastSignalSent)
                            "Last Signal Sent: ${state.lastSignalSent} (${dir?.displayName ?: ""})"
                        }
                    } else {
                        "Last Signal Sent: None"
                    }
                    binding.tvLastSignal.text = lastSignalText

                    // Transmission Status
                    binding.tvTransmissionStatus.text = when (val t = state.lastTransmission) {
                        is TransmissionResult.Success -> t.toDisplayText()
                        is TransmissionResult.Failure -> t.toDisplayText()
                        is TransmissionResult.InFlight -> t.toDisplayText()
                        null -> preferenceManager.lastTransmissionText ?: "Transmission: Idle"
                    }
                }
            }
        }
    }
}
