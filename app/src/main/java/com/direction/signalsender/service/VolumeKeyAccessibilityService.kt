package com.direction.signalsender.service

import android.accessibilityservice.AccessibilityService
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent

class VolumeKeyAccessibilityService : AccessibilityService() {

    override fun onKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_VOLUME_DOWN && event.action == KeyEvent.ACTION_DOWN) {
            // Volume Down button clicked: toggle Signal-0 mode
            DirectionMonitorService.toggleSignalZeroMode(this)
            return true // Consume key event
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
