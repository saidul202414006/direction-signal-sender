package com.direction.signalsender.domain.model

/**
 * Strict cardinal direction mapping according to project specification:
 * - North = 1 (centered at 0°/360°)
 * - West  = 2 (centered at 270°)
 * - South = 3 (centered at 180°)
 * - East  = 4 (centered at 90°)
 */
enum class CardinalDirection(val signal: Int, val displayName: String) {
    NORTH(1, "NORTH"),
    WEST(2, "WEST"),
    SOUTH(3, "SOUTH"),
    EAST(4, "EAST");

    companion object {
        fun fromSignal(signal: Int): CardinalDirection? = entries.firstOrNull { it.signal == signal }
    }
}
