package com.direction.signalsender.data.preferences

import android.content.Context
import android.content.SharedPreferences
import com.direction.signalsender.domain.model.CardinalDirection

class PreferenceManager(context: Context) {

    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    var endpointUrl: String
        get() = prefs.getString(KEY_ENDPOINT_URL, DEFAULT_URL) ?: DEFAULT_URL
        set(value) = prefs.edit().putString(KEY_ENDPOINT_URL, value.trim()).apply()

    var isServiceEnabled: Boolean
        get() = prefs.getBoolean(KEY_SERVICE_ENABLED, false)
        set(value) = prefs.edit().putBoolean(KEY_SERVICE_ENABLED, value).apply()

    var lastConfirmedDirection: CardinalDirection?
        get() {
            val name = prefs.getString(KEY_LAST_DIRECTION, null) ?: return null
            return try {
                CardinalDirection.valueOf(name)
            } catch (e: IllegalArgumentException) {
                null
            }
        }
        set(value) = prefs.edit().putString(KEY_LAST_DIRECTION, value?.name).apply()

    var lastSentSignal: Int?
        get() {
            val sig = prefs.getInt(KEY_LAST_SIGNAL, -1)
            return if (sig == -1) null else sig
        }
        set(value) {
            if (value == null) {
                prefs.edit().remove(KEY_LAST_SIGNAL).apply()
            } else {
                prefs.edit().putInt(KEY_LAST_SIGNAL, value).apply()
            }
        }

    var lastTransmissionText: String?
        get() = prefs.getString(KEY_LAST_TRANSMISSION, null)
        set(value) = prefs.edit().putString(KEY_LAST_TRANSMISSION, value).apply()

    var isSignalZeroMode: Boolean
        get() = prefs.getBoolean(KEY_SIGNAL_ZERO_MODE, false)
        set(value) = prefs.edit().putBoolean(KEY_SIGNAL_ZERO_MODE, value).apply()

    companion object {
        private const val PREFS_NAME = "direction_signal_sender_prefs"
        private const val KEY_ENDPOINT_URL = "key_endpoint_url"
        private const val KEY_SERVICE_ENABLED = "key_service_enabled"
        private const val KEY_LAST_DIRECTION = "key_last_direction"
        private const val KEY_LAST_SIGNAL = "key_last_signal"
        private const val KEY_LAST_TRANSMISSION = "key_last_transmission"
        private const val KEY_SIGNAL_ZERO_MODE = "key_signal_zero_mode"

        const val DEFAULT_URL = "https://example.com/api/direction"
    }
}
