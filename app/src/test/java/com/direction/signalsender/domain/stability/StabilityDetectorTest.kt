package com.direction.signalsender.domain.stability

import com.direction.signalsender.domain.model.CardinalDirection
import com.direction.signalsender.domain.model.MotionStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

class StabilityDetectorTest {

    private lateinit var detector: StabilityDetector

    @Before
    fun setup() {
        // Window: 1000ms, Min samples: 10, Max excursion: 7.0 deg, Min stable duration: 750ms
        detector = StabilityDetector(
            windowDurationMs = 1000L,
            minSamplesInWindow = 10,
            maxAngularExcursionForStableDeg = 7.0f,
            minStableDurationMs = 750L
        )
    }

    @Test
    fun `test moving phone does not trigger stable confirmation`() {
        var baseTime = 10000L
        // Rotate rapidly from North (0°) to East (90°) to South (180°)
        val sweepAngles = floatArrayOf(
            0f, 15f, 35f, 55f, 75f, 95f, 115f, 135f, 155f, 175f, 195f
        )

        for (angle in sweepAngles) {
            val result = detector.addSample(angle, baseTime)
            baseTime += 80L // 80ms interval
            // While rotating across angles, stability should not be confirmed
            assertNull("Should not confirm stable direction while rotating", result.stableDirectionConfirmed)
        }
    }

    @Test
    fun `test stable phone settles and confirms direction within low latency target`() {
        var time = 10000L

        // Feed moving samples first
        for (i in 0 until 12) {
            detector.addSample(i * 10f, time)
            time += 50L
        }

        val stopMovingTime = time

        // Phone now stops at South (around 180°) and stays stable
        val stableSamples = floatArrayOf(
            180.0f, 180.5f, 179.8f, 180.2f, 180.0f,
            179.9f, 180.1f, 180.4f, 180.0f, 179.7f,
            180.1f, 180.2f, 179.9f, 180.0f, 180.3f,
            180.1f, 180.0f, 179.8f, 180.2f, 180.1f,
            180.0f, 179.9f, 180.1f, 180.2f, 180.0f,
            180.0f, 180.1f, 179.8f, 180.2f, 180.0f
        )

        var confirmedDirection: CardinalDirection? = null
        var confirmationTimeMs = 0L

        for (angle in stableSamples) {
            val result = detector.addSample(angle, time)
            if (result.stableDirectionConfirmed != null && confirmedDirection == null) {
                confirmedDirection = result.stableDirectionConfirmed
                confirmationTimeMs = time
            }
            time += 50L
        }

        assertEquals(CardinalDirection.SOUTH, confirmedDirection)
        // Latency check: should settle and confirm within approximately 1-2 seconds
        val latencyMs = confirmationTimeMs - stopMovingTime
        org.junit.Assert.assertTrue("Latency should be <= 2000ms, actual: $latencyMs ms", latencyMs <= 2000L)
    }
}
