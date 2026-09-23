package com.direction.signalsender.domain.dsp

import org.junit.Assert.assertEquals
import org.junit.Test

class AzimuthCalculatorTest {

    @Test
    fun `test normalizeDegrees within standard ranges`() {
        assertEquals(0f, AzimuthCalculator.normalizeDegrees(0f), 0.001f)
        assertEquals(180f, AzimuthCalculator.normalizeDegrees(180f), 0.001f)
        assertEquals(359.9f, AzimuthCalculator.normalizeDegrees(359.9f), 0.001f)
        assertEquals(0f, AzimuthCalculator.normalizeDegrees(360f), 0.001f)
        assertEquals(10f, AzimuthCalculator.normalizeDegrees(370f), 0.001f)
        assertEquals(350f, AzimuthCalculator.normalizeDegrees(-10f), 0.001f)
        assertEquals(270f, AzimuthCalculator.normalizeDegrees(-90f), 0.001f)
        assertEquals(180f, AzimuthCalculator.normalizeDegrees(-180f), 0.001f)
    }

    @Test
    fun `test circularDistance across zero seam`() {
        // Distance across the North boundary
        assertEquals(2.0f, AzimuthCalculator.circularDistance(359.0f, 1.0f), 0.001f)
        assertEquals(2.0f, AzimuthCalculator.circularDistance(1.0f, 359.0f), 0.001f)
        assertEquals(20.0f, AzimuthCalculator.circularDistance(10.0f, 350.0f), 0.001f)

        // Standard distances
        assertEquals(90.0f, AzimuthCalculator.circularDistance(45.0f, 135.0f), 0.001f)
        assertEquals(180.0f, AzimuthCalculator.circularDistance(0.0f, 180.0f), 0.001f)
        assertEquals(0.0f, AzimuthCalculator.circularDistance(270.0f, 270.0f), 0.001f)
    }
}
