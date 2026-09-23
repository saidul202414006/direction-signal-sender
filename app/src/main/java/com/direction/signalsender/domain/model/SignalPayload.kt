package com.direction.signalsender.domain.model

/**
 * Exact JSON payload model specified in requirements:
 * {
 *   "signal": <int>
 * }
 */
data class SignalPayload(val signal: Int) {
    fun toJson(): String = "{\"signal\":$signal}"
}
