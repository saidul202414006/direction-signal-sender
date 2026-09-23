package com.direction.signalsender.domain.dispatcher

import com.direction.signalsender.domain.model.CardinalDirection

class SignalDispatcher(
    private val onSendSignal: (Int) -> Unit
) {
    var lastConfirmedDirection: CardinalDirection? = null
        private set

    var lastSentSignal: Int? = null
        private set

    var isSignalZeroMode: Boolean = false
        private set

    /**
     * Toggles Signal-0 mode.
     * When ON, all normal direction signals (1, 2, 3, 4) are suppressed.
     * When OFF, normal direction signals resume.
     */
    @Synchronized
    fun toggleSignalZeroMode(): Boolean {
        isSignalZeroMode = !isSignalZeroMode
        if (!isSignalZeroMode) {
            // When exiting Signal-0 mode, reset lastConfirmedDirection so that
            // direction-based signals resume cleanly for the current stable direction.
            lastConfirmedDirection = null
        }
        return isSignalZeroMode
    }

    @Synchronized
    fun setSignalZeroMode(enabled: Boolean) {
        isSignalZeroMode = enabled
        if (!enabled) {
            lastConfirmedDirection = null
        }
    }

    /**
     * Dispatches signal if and only if:
     * 1. Signal-0 mode is NOT active.
     * 2. The confirmed stable direction is different from the last confirmed direction.
     * Returns true if signal was dispatched, false if suppressed.
     */
    @Synchronized
    fun onDirectionStabilized(direction: CardinalDirection): Boolean {
        if (isSignalZeroMode) {
            // In Signal-0 mode, normal direction-based signals are completely stopped
            return false
        }

        if (direction == lastConfirmedDirection) {
            // Suppress duplicate transmission while phone remains in same direction
            return false
        }

        val signal = direction.signal
        lastConfirmedDirection = direction
        lastSentSignal = signal
        onSendSignal(signal)
        return true
    }

    @Synchronized
    fun reset() {
        lastConfirmedDirection = null
        lastSentSignal = null
        isSignalZeroMode = false
    }

    @Synchronized
    fun restoreState(direction: CardinalDirection?, signal: Int?) {
        lastConfirmedDirection = direction
        lastSentSignal = signal
    }
}
