package com.direction.signalsender.domain.stability

import com.direction.signalsender.domain.dsp.AzimuthCalculator
import com.direction.signalsender.domain.dsp.CircularMovingAverage
import com.direction.signalsender.domain.dsp.SectorClassifier
import com.direction.signalsender.domain.model.CardinalDirection
import com.direction.signalsender.domain.model.MotionStatus

class StabilityDetector(
    private val windowDurationMs: Long = 1000L,
    private val minSamplesInWindow: Int = 10,
    private val maxAngularExcursionForStableDeg: Float = 7.0f,
    private val minStableDurationMs: Long = 750L
) {
    private data class TimestampedHeading(val azimuthDeg: Float, val timestampMs: Long)

    private val sampleBuffer = ArrayDeque<TimestampedHeading>()
    private val circularFilter = CircularMovingAverage(windowSize = 8)

    private var currentMotionStatus: MotionStatus = MotionStatus.UNKNOWN
    private var stablePeriodStartTimeMs: Long? = null
    private var lastStableDirectionReported: CardinalDirection? = null

    data class DetectionResult(
        val motionStatus: MotionStatus,
        val instantaneousSector: CardinalDirection,
        val stableDirectionConfirmed: CardinalDirection? = null,
        val smoothedAzimuth: Float
    )

    @Synchronized
    fun addSample(rawAzimuthDeg: Float, timestampMs: Long = System.currentTimeMillis()): DetectionResult {
        val smoothed = circularFilter.addSample(rawAzimuthDeg)
        val currentSector = SectorClassifier.classify(smoothed)

        // Append new sample
        sampleBuffer.addLast(TimestampedHeading(smoothed, timestampMs))

        // Evict expired samples outside window
        while (sampleBuffer.isNotEmpty() && (timestampMs - sampleBuffer.first().timestampMs) > windowDurationMs) {
            sampleBuffer.removeFirst()
        }

        // Check if we have enough samples to evaluate
        if (sampleBuffer.size < minSamplesInWindow) {
            return DetectionResult(
                motionStatus = MotionStatus.UNKNOWN,
                instantaneousSector = currentSector,
                stableDirectionConfirmed = null,
                smoothedAzimuth = smoothed
            )
        }

        // Calculate max angular excursion (spread) across the window
        var maxExcursion = 0.0f
        val samplesList = sampleBuffer.toList()
        for (i in 0 until samplesList.size - 1) {
            val dist = AzimuthCalculator.circularDistance(samplesList[i].azimuthDeg, samplesList.last().azimuthDeg)
            if (dist > maxExcursion) {
                maxExcursion = dist
            }
        }

        // Check if all samples fall into the exact same cardinal sector
        val allSameSector = samplesList.all { SectorClassifier.classify(it.azimuthDeg) == currentSector }

        var newlyConfirmedDirection: CardinalDirection? = null

        if (maxExcursion > maxAngularExcursionForStableDeg || !allSameSector) {
            // Movement detected
            currentMotionStatus = MotionStatus.MOVING
            stablePeriodStartTimeMs = null
            lastStableDirectionReported = null
        } else {
            // Low excursion and consistent sector: potential stability
            if (stablePeriodStartTimeMs == null) {
                stablePeriodStartTimeMs = timestampMs
            }

            val stableDuration = timestampMs - (stablePeriodStartTimeMs ?: timestampMs)
            if (stableDuration >= minStableDurationMs) {
                currentMotionStatus = MotionStatus.STABLE
                if (lastStableDirectionReported != currentSector) {
                    newlyConfirmedDirection = currentSector
                    lastStableDirectionReported = currentSector
                }
            }
        }

        return DetectionResult(
            motionStatus = currentMotionStatus,
            instantaneousSector = currentSector,
            stableDirectionConfirmed = newlyConfirmedDirection,
            smoothedAzimuth = smoothed
        )
    }

    @Synchronized
    fun reset() {
        sampleBuffer.clear()
        circularFilter.clear()
        currentMotionStatus = MotionStatus.UNKNOWN
        stablePeriodStartTimeMs = null
        lastStableDirectionReported = null
    }
}
