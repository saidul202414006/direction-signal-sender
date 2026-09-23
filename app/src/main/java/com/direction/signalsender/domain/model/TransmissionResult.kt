package com.direction.signalsender.domain.model

sealed class TransmissionResult {
    abstract val signal: Int
    abstract val timestamp: Long

    data class Success(
        override val signal: Int,
        val httpCode: Int,
        override val timestamp: Long = System.currentTimeMillis()
    ) : TransmissionResult() {
        fun toDisplayText(): String = "Signal $signal | HTTP $httpCode | Sent"
    }

    data class Failure(
        override val signal: Int,
        val errorMessage: String,
        val httpCode: Int? = null,
        override val timestamp: Long = System.currentTimeMillis()
    ) : TransmissionResult() {
        fun toDisplayText(): String = "Signal $signal | Failed: $errorMessage"
    }

    data class InFlight(
        override val signal: Int,
        override val timestamp: Long = System.currentTimeMillis()
    ) : TransmissionResult() {
        fun toDisplayText(): String = "Signal $signal | Sending..."
    }
}

enum class MotionStatus(val displayName: String) {
    MOVING("MOVING"),
    STABLE("STABLE"),
    UNKNOWN("CALIBRATING")
}

data class DirectionState(
    val azimuthDeg: Float = 0f,
    val direction: CardinalDirection = CardinalDirection.NORTH,
    val lastConfirmedDirection: CardinalDirection? = null,
    val motionStatus: MotionStatus = MotionStatus.UNKNOWN,
    val lastSignalSent: Int? = null,
    val lastTransmission: TransmissionResult? = null,
    val isServiceRunning: Boolean = false,
    val configuredUrl: String = ""
)
