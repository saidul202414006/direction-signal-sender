package com.direction.signalsender.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent

class VolumeKeyAccessibilityService : AccessibilityService() {

    override fun onServiceConnected() {
        super.onServiceConnected()
        try {
            val info = serviceInfo ?: AccessibilityServiceInfo()
            info.flags = info.flags or AccessibilityServiceInfo.FLAG_REQUEST_FILTER_KEY_EVENTS
            info.eventTypes = AccessibilityEvent.TYPES_ALL_MASK
            serviceInfo = info
        } catch (e: Exception) {
            // Ignore
        }
    }

    override fun onKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                // Volume Down button clicked: toggle Signal-0 mode
                DirectionMonitorService.toggleSignalZeroMode(this)
            }
            // Always consume both ACTION_DOWN and ACTION_UP so media volume never changes
            return true
        }
        return super.onKeyEvent(event)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // No UI event observation needed
    }

    override fun onInterrupt() {
        // Service interrupted
    }
}
