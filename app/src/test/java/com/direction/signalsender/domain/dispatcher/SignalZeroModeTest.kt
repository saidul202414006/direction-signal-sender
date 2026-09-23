package com.direction.signalsender.domain.dispatcher

import com.direction.signalsender.domain.model.CardinalDirection
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class SignalZeroModeTest {

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
    fun `test Volume Down 1st click enables Signal-0 mode and suppresses all direction signals`() {
        // Normal mode: sends signal 1 for North
        dispatcher.onDirectionStabilized(CardinalDirection.NORTH)
        assertEquals(listOf(1), sentSignals)

        // 1st Volume Down click: Enable Signal-0 mode
        val enabled = dispatcher.toggleSignalZeroMode()
        assertTrue("Signal-0 mode should be enabled", enabled)
        assertTrue("isSignalZeroMode should be true", dispatcher.isSignalZeroMode)

        // While in Signal-0 mode, rotating to any direction must NOT trigger direction signals!
        val sentWest = dispatcher.onDirectionStabilized(CardinalDirection.WEST)
        assertFalse("Direction signal should be suppressed in Signal-0 mode", sentWest)

        val sentSouth = dispatcher.onDirectionStabilized(CardinalDirection.SOUTH)
        assertFalse("Direction signal should be suppressed in Signal-0 mode", sentSouth)

        val sentEast = dispatcher.onDirectionStabilized(CardinalDirection.EAST)
        assertFalse("Direction signal should be suppressed in Signal-0 mode", sentEast)

        // Sent list should still only have the initial 1 from before
        assertEquals(listOf(1), sentSignals)
    }

    @Test
    fun `test Volume Down 2nd click disables Signal-0 mode and resumes normal direction signals`() {
        // 1st click: Turn ON
        dispatcher.toggleSignalZeroMode()
        assertTrue(dispatcher.isSignalZeroMode)

        // 2nd click: Turn OFF
        val stillEnabled = dispatcher.toggleSignalZeroMode()
        assertFalse("Signal-0 mode should now be disabled", stillEnabled)
        assertFalse(dispatcher.isSignalZeroMode)

        // Now direction-based signals must resume!
        val dispatched = dispatcher.onDirectionStabilized(CardinalDirection.WEST)
        assertTrue("Direction signal should be sent after disabling Signal-0 mode", dispatched)
        assertEquals(listOf(2), sentSignals)
    }

    @Test
    fun `test repetitive toggle behavior`() {
        assertFalse(dispatcher.isSignalZeroMode)

        // Click 1: ON
        assertTrue(dispatcher.toggleSignalZeroMode())
        // Click 2: OFF
        assertFalse(dispatcher.toggleSignalZeroMode())
        // Click 3: ON
        assertTrue(dispatcher.toggleSignalZeroMode())
        // Click 4: OFF
        assertFalse(dispatcher.toggleSignalZeroMode())
    }
}
