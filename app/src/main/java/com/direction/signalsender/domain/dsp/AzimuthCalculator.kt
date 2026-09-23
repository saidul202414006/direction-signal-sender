package com.direction.signalsender.domain.dsp

import kotlin.math.abs

object AzimuthCalculator {

    /**
     * Normalizes any angle in degrees to the range [0.0, 360.0).
     */
    fun normalizeDegrees(degrees: Float): Float {
        var normalized = degrees % 360f
        if (normalized < 0f) {
            normalized += 360f
        }
        return normalized
    }

    /**
     * Calculates the shortest angular distance between two angles on a circle [0, 360).
     * Guaranteed result in [0.0, 180.0].
     */
    fun circularDistance(deg1: Float, deg2: Float): Float {
        val n1 = normalizeDegrees(deg1)
        val n2 = normalizeDegrees(deg2)
        var diff = abs(n1 - n2) % 360f
        if (diff > 180f) {
            diff = 360f - diff
        }
        return diff
    }

    /**
     * Converts raw azimuth in radians [-PI, +PI] (from SensorManager.getOrientation)
     * to degrees in range [0.0, 360.0).
     */
    fun radiansToDegrees(azimuthRad: Float): Float {
        val deg = Math.toDegrees(azimuthRad.toDouble()).toFloat()
        return normalizeDegrees(deg)
    }
}
