package com.direction.signalsender.domain.dispatcher

import com.direction.signalsender.domain.model.CardinalDirection
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class SignalDispatcherTest {

    private val sentSignals = mutableListOf<Int>()
    private lateinit var dispatcher: SignalDispatcher

    @Before
    fun setup() {
        sentSignals.clear()
        dispatcher = SignalDispatcher { signal ->
            sentSignals.add(signal)
        }
    }

    @Test
    fun `test initial direction stabilization fires signal`() {
        val dispatched = dispatcher.onDirectionStabilized(CardinalDirection.NORTH)
        assertTrue(dispatched)
        assertEquals(listOf(1), sentSignals)
        assertEquals(CardinalDirection.NORTH, dispatcher.lastConfirmedDirection)
        assertEquals(1, dispatcher.lastSentSignal)
    }

    @Test
    fun `test duplicate stable events in same direction are suppressed`() {
        // First stable South event
        val first = dispatcher.onDirectionStabilized(CardinalDirection.SOUTH)
        assertTrue(first)
        assertEquals(listOf(3), sentSignals)

        // Multiple subsequent stable South events while stationary
        for (i in 1..10) {
            val duplicate = dispatcher.onDirectionStabilized(CardinalDirection.SOUTH)
            assertFalse("Duplicate stable event should be suppressed", duplicate)
        }

        // Verify sentSignals list still has length 1 (only sent once!)
        assertEquals(1, sentSignals.size)
        assertEquals(listOf(3), sentSignals)
    }

    @Test
    fun `test moving to new direction triggers new signal`() {
        dispatcher.onDirectionStabilized(CardinalDirection.SOUTH) // 3
        dispatcher.onDirectionStabilized(CardinalDirection.WEST)  // 2
        dispatcher.onDirectionStabilized(CardinalDirection.NORTH) // 1
        dispatcher.onDirectionStabilized(CardinalDirection.EAST)  // 4

        assertEquals(listOf(3, 2, 1, 4), sentSignals)
    }
}
