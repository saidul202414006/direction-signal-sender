package com.direction.signalsender.domain.dsp

import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin

/**
 * Rolling circular mean filter in Cartesian vector space.
 * Prevents jump artifacts when smoothing across the 359° <-> 1° boundary.
 */
class CircularMovingAverage(private val windowSize: Int = 10) {

    private val samples = ArrayDeque<Float>(windowSize)

    @Synchronized
    fun addSample(degrees: Float): Float {
        if (samples.size >= windowSize) {
            samples.removeFirst()
        }
        samples.addLast(AzimuthCalculator.normalizeDegrees(degrees))
        return getAverage()
    }

    @Synchronized
    fun getAverage(): Float {
        if (samples.isEmpty()) return 0f

        var sumSin = 0.0
        var sumCos = 0.0

        for (deg in samples) {
            val rad = Math.toRadians(deg.toDouble())
            sumSin += sin(rad)
            sumCos += cos(rad)
        }

        val avgRad = atan2(sumSin, sumCos)
        val avgDeg = Math.toDegrees(avgRad).toFloat()
        return AzimuthCalculator.normalizeDegrees(avgDeg)
    }

    @Synchronized
    fun clear() {
        samples.clear()
    }
}
