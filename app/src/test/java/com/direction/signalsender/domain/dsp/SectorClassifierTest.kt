package com.direction.signalsender.domain.dsp

import com.direction.signalsender.domain.model.CardinalDirection
import org.junit.Assert.assertEquals
import org.junit.Test

class SectorClassifierTest {

    @Test
    fun `test North sector boundaries`() {
        assertEquals(CardinalDirection.NORTH, SectorClassifier.classify(0.0f))
        assertEquals(CardinalDirection.NORTH, SectorClassifier.classify(359.9f))
        assertEquals(CardinalDirection.NORTH, SectorClassifier.classify(315.0f))
        assertEquals(CardinalDirection.NORTH, SectorClassifier.classify(315.1f))
        assertEquals(CardinalDirection.NORTH, SectorClassifier.classify(44.9f))
        assertEquals(CardinalDirection.NORTH, SectorClassifier.classify(720.0f)) // Multi-turn wrap
        assertEquals(CardinalDirection.NORTH, SectorClassifier.classify(-1.0f))  // Negative wrap
    }

    @Test
    fun `test East sector boundaries`() {
        assertEquals(CardinalDirection.EAST, SectorClassifier.classify(45.0f))
        assertEquals(CardinalDirection.EAST, SectorClassifier.classify(90.0f))
        assertEquals(CardinalDirection.EAST, SectorClassifier.classify(134.9f))
    }

    @Test
    fun `test South sector boundaries`() {
        assertEquals(CardinalDirection.SOUTH, SectorClassifier.classify(135.0f))
        assertEquals(CardinalDirection.SOUTH, SectorClassifier.classify(180.0f))
        assertEquals(CardinalDirection.SOUTH, SectorClassifier.classify(224.9f))
    }

    @Test
    fun `test West sector boundaries`() {
        assertEquals(CardinalDirection.WEST, SectorClassifier.classify(225.0f))
        assertEquals(CardinalDirection.WEST, SectorClassifier.classify(270.0f))
        assertEquals(CardinalDirection.WEST, SectorClassifier.classify(314.9f))
    }
}
