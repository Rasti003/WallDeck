package pl.home.wallpanel

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.PackageManager
import android.graphics.ImageFormat
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.media.Image
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock

class CameraLightSampler(
    private val activity: Activity,
    private val onReading: (Double) -> Unit,
) {
    private val manager = activity.getSystemService(CameraManager::class.java)
    private val thread = HandlerThread("WallDeckCameraLight").apply { start() }
    private val handler = Handler(thread.looper)
    @Volatile private var requested = false
    @Volatile private var resumed = false
    private var intervalMs = 30_000L
    private var camera: CameraDevice? = null
    private var session: CameraCaptureSession? = null
    private var reader: ImageReader? = null
    private var frames = 0
    private var sampling = false
    private val nextSample = Runnable { sample() }
    private val timeout = Runnable { finishSample() }

    fun configure(enabled: Boolean, intervalSeconds: Int) {
        requested = enabled
        intervalMs = intervalSeconds.coerceIn(10, 300) * 1_000L
        handler.removeCallbacks(nextSample)
        if (enabled && resumed && hasPermission()) handler.post { sample() } else handler.post { finishSample(false) }
    }

    fun onResume() {
        resumed = true
        if (requested && hasPermission()) handler.post { sample() }
    }

    fun onPause() {
        resumed = false
        handler.post { finishSample(false) }
    }

    fun permissionGranted() {
        if (requested && resumed && hasPermission()) handler.post { sample() }
    }

    fun isRequested() = requested
    fun hasPermission() = activity.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

    @SuppressLint("MissingPermission")
    private fun sample() {
        if (!requested || !resumed || !hasPermission() || sampling) return
        val cameraId = manager.cameraIdList.firstOrNull { id ->
            manager.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_FRONT
        } ?: return scheduleNext()
        val sizes = manager.getCameraCharacteristics(cameraId)
            .get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
            ?.getOutputSizes(ImageFormat.YUV_420_888)
            .orEmpty()
        val size = sizes.minByOrNull { it.width.toLong() * it.height } ?: return scheduleNext()
        sampling = true
        frames = 0
        reader = ImageReader.newInstance(size.width, size.height, ImageFormat.YUV_420_888, 3).apply {
            setOnImageAvailableListener({ source -> source.acquireLatestImage()?.use(::consume) }, handler)
        }
        handler.postDelayed(timeout, 6_000)
        manager.openCamera(cameraId, object : CameraDevice.StateCallback() {
            override fun onOpened(device: CameraDevice) {
                if (!requested || !resumed) {
                    device.close()
                    finishSample(false)
                    return
                }
                camera = device
                device.createCaptureSession(listOf(reader!!.surface), object : CameraCaptureSession.StateCallback() {
                    override fun onConfigured(captureSession: CameraCaptureSession) {
                        if (!requested || !resumed) {
                            captureSession.close()
                            finishSample(false)
                            return
                        }
                        session = captureSession
                        val request = device.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply { addTarget(reader!!.surface) }.build()
                        captureSession.setRepeatingRequest(request, null, handler)
                    }
                    override fun onConfigureFailed(captureSession: CameraCaptureSession) = finishSample()
                }, handler)
            }
            override fun onDisconnected(device: CameraDevice) { device.close(); finishSample() }
            override fun onError(device: CameraDevice, error: Int) { device.close(); finishSample() }
        }, handler)
    }

    private fun consume(image: Image) {
        if (!requested || !resumed) return finishSample(false)
        frames += 1
        if (frames < 3) return
        val plane = image.planes[0]
        val buffer = plane.buffer
        val rowStride = plane.rowStride
        val pixelStride = plane.pixelStride
        var sum = 0L
        var count = 0
        val stepX = 16
        val stepY = 16
        for (y in 0 until image.height step stepY) {
            for (x in 0 until image.width step stepX) {
                val index = y * rowStride + x * pixelStride
                if (index < buffer.limit()) {
                    sum += buffer.get(index).toInt() and 0xff
                    count += 1
                }
            }
        }
        if (count > 0) onReading(sum.toDouble() / count / 255.0 * 100.0)
        finishSample()
    }

    private fun finishSample(schedule: Boolean = true) {
        handler.removeCallbacks(timeout)
        runCatching { session?.stopRepeating() }
        session?.close(); session = null
        camera?.close(); camera = null
        reader?.close(); reader = null
        sampling = false
        if (schedule) scheduleNext()
    }

    private fun scheduleNext() {
        handler.removeCallbacks(nextSample)
        if (requested && resumed) handler.postAtTime(nextSample, SystemClock.uptimeMillis() + intervalMs)
    }

    fun destroy() {
        requested = false
        resumed = false
        handler.post {
            finishSample(false)
            thread.quitSafely()
        }
    }
}
