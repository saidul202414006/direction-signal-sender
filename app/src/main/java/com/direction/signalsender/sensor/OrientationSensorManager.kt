package com.direction.signalsender.sensor

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import com.direction.signalsender.domain.dsp.AzimuthCalculator

class OrientationSensorManager(
    context: Context,
    private val onHeadingChanged: (Float) -> Unit
) : SensorEventListener {

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager

    private val rotationVectorSensor: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    private val accelerometerSensor: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val magneticSensor: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)

    private val rotationMatrix = FloatArray(9)
    private val orientationAngles = FloatArray(3)

    // Fallback buffers
    private val accelerometerReading = FloatArray(3)
    private val magnetometerReading = FloatArray(3)
    private var hasAccelerometerReading = false
    private var hasMagnetometerReading = false

    private var isUsingRotationVector = false
    var isListening: Boolean = false
        private set

    fun startListening(): Boolean {
        if (isListening) return true

        if (rotationVectorSensor != null) {
            val registered = sensorManager.registerListener(
                this,
                rotationVectorSensor,
                SensorManager.SENSOR_DELAY_UI
            )
            if (registered) {
                isUsingRotationVector = true
                isListening = true
                return true
            }
        }

        // Fallback to Accelerometer + Magnetometer
        if (accelerometerSensor != null && magneticSensor != null) {
            val regAcc = sensorManager.registerListener(
                this,
                accelerometerSensor,
                SensorManager.SENSOR_DELAY_UI
            )
            val regMag = sensorManager.registerListener(
                this,
                magneticSensor,
                SensorManager.SENSOR_DELAY_UI
            )
            if (regAcc && regMag) {
                isUsingRotationVector = false
                isListening = true
                return true
            }
        }

        return false
    }

    fun stopListening() {
        if (!isListening) return
        sensorManager.unregisterListener(this)
        isListening = false
        hasAccelerometerReading = false
        hasMagnetometerReading = false
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type == Sensor.TYPE_ROTATION_VECTOR) {
            SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)
            computeAzimuthAndNotify()
        } else if (event.sensor.type == Sensor.TYPE_ACCELEROMETER) {
            System.arraycopy(event.values, 0, accelerometerReading, 0, accelerometerReading.size)
            hasAccelerometerReading = true
            if (hasMagnetometerReading) {
                computeFallbackOrientation()
            }
        } else if (event.sensor.type == Sensor.TYPE_MAGNETIC_FIELD) {
            System.arraycopy(event.values, 0, magnetometerReading, 0, magnetometerReading.size)
            hasMagnetometerReading = true
            if (hasAccelerometerReading) {
                computeFallbackOrientation()
            }
        }
    }

    private fun computeFallbackOrientation() {
        val success = SensorManager.getRotationMatrix(
            rotationMatrix,
            null,
            accelerometerReading,
            magnetometerReading
        )
        if (success) {
            computeAzimuthAndNotify()
        }
    }

    private fun computeAzimuthAndNotify() {
        SensorManager.getOrientation(rotationMatrix, orientationAngles)
        val azimuthRad = orientationAngles[0]
        val azimuthDeg = AzimuthCalculator.radiansToDegrees(azimuthRad)
        onHeadingChanged(azimuthDeg)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // No action required
    }
}
