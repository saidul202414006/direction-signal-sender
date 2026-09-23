package com.direction.signalsender.domain.dsp

import com.direction.signalsender.domain.model.CardinalDirection

object SectorClassifier {

    /**
     * Cardinal sectors partitioned into 90° intervals centered at cardinal axes:
     * - North: [315°, 360°) U [0°, 45°)
     * - East:  [45°, 135°)
     * - South: [135°, 225°)
     * - West:  [225°, 315°)
     */
    fun classify(azimuthDegrees: Float): CardinalDirection {
        val normalized = AzimuthCalculator.normalizeDegrees(azimuthDegrees)

        return when {
            normalized >= 315.0f || normalized < 45.0f -> CardinalDirection.NORTH
            normalized >= 45.0f && normalized < 135.0f -> CardinalDirection.EAST
            normalized >= 135.0f && normalized < 225.0f -> CardinalDirection.SOUTH
            normalized >= 225.0f && normalized < 315.0f -> CardinalDirection.WEST
            else -> CardinalDirection.NORTH // Fallback (mathematically unreachable)
        }
    }
}
