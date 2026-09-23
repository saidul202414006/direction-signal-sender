package com.direction.signalsender.domain.model

import org.junit.Assert.assertEquals
import org.junit.Test

class SignalPayloadTest {

    @Test
    fun `test strict signal numeric mapping`() {
        assertEquals(1, CardinalDirection.NORTH.signal)
        assertEquals(2, CardinalDirection.WEST.signal)
        assertEquals(3, CardinalDirection.SOUTH.signal)
        assertEquals(4, CardinalDirection.EAST.signal)
    }

    @Test
    fun `test JSON payload format serialization`() {
        assertEquals("{\"signal\":1}", SignalPayload(1).toJson())
        assertEquals("{\"signal\":2}", SignalPayload(2).toJson())
        assertEquals("{\"signal\":3}", SignalPayload(3).toJson())
        assertEquals("{\"signal\":4}", SignalPayload(4).toJson())
    }
}
