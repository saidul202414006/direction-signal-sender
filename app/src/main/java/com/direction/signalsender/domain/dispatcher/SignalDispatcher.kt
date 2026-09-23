package com.direction.signalsender.domain.dispatcher

import com.direction.signalsender.domain.model.CardinalDirection

class SignalDispatcher(
    private val onSendSignal: (Int) -> Unit
) {
    var lastConfirmedDirection: CardinalDirection? = null
        private set

    var lastSentSignal: Int? = null
        private set

    /**
     * Dispatches signal if and only if the confirmed stable direction is different
     * from the last confirmed direction.
     * Returns true if signal was dispatched, false if duplicate was suppressed.
     */
    @Synchronized
    fun onDirectionStabilized(direction: CardinalDirection): Boolean {
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
    }

    @Synchronized
    fun restoreState(direction: CardinalDirection?, signal: Int?) {
        lastConfirmedDirection = direction
        lastSentSignal = signal
    }
}
