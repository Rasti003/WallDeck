package pl.home.wallpanel

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import kotlin.math.PI
import kotlin.math.sin

class NotificationSoundPlayer(context: Context) {
    private val audio = context.getSystemService(AudioManager::class.java)
    private val releaseHandler = Handler(Looper.getMainLooper())

    fun play(sound: String, volume: Double): JSONObject {
        require(sound in setOf("soft", "chime", "alarm")) { "INVALID_SOUND" }
        require(volume in 0.05..1.0) { "INVALID_VOLUME" }
        val samples = render(sound)
        val attributes = AudioAttributes.Builder()
            .setUsage(if (sound == "alarm") AudioAttributes.USAGE_ALARM else AudioAttributes.USAGE_NOTIFICATION_EVENT)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        val track = AudioTrack.Builder()
            .setAudioAttributes(attributes)
            .setAudioFormat(AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(SAMPLE_RATE)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .build())
            .setTransferMode(AudioTrack.MODE_STATIC)
            .setBufferSizeInBytes(samples.size * Short.SIZE_BYTES)
            .build()
        val speaker = audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
            .firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
        val preferred = speaker != null && track.setPreferredDevice(speaker)
        track.setVolume(volume.toFloat())
        require(track.write(samples, 0, samples.size, AudioTrack.WRITE_BLOCKING) == samples.size) { "AUDIO_WRITE_FAILED" }
        track.play()
        releaseHandler.postDelayed({ runCatching { track.stop() }; track.release() }, samples.size * 1000L / SAMPLE_RATE + 200L)
        return JSONObject()
            .put("played", true)
            .put("route", "tablet-speaker")
            .put("preferredDeviceAccepted", preferred)
            .put("deviceName", speaker?.productName?.toString() ?: JSONObject.NULL)
    }

    private fun render(sound: String): ShortArray {
        val tones = when (sound) {
            "soft" -> listOf(Tone(520.0, 0, 120))
            "chime" -> listOf(Tone(523.0, 0, 140), Tone(784.0, 130, 220))
            else -> listOf(Tone(740.0, 0, 200), Tone(520.0, 240, 200), Tone(740.0, 480, 280))
        }
        val totalMs = tones.maxOf { it.startMs + it.durationMs }
        val result = ShortArray(totalMs * SAMPLE_RATE / 1000)
        for (tone in tones) {
            val start = tone.startMs * SAMPLE_RATE / 1000
            val length = tone.durationMs * SAMPLE_RATE / 1000
            val edge = (SAMPLE_RATE * 0.015).toInt().coerceAtLeast(1)
            for (offset in 0 until length) {
                val envelope = minOf(1.0, offset.toDouble() / edge, (length - offset).toDouble() / edge)
                val wave = if (sound == "alarm") {
                    if (sin(2.0 * PI * tone.frequency * offset / SAMPLE_RATE) >= 0) 1.0 else -1.0
                } else sin(2.0 * PI * tone.frequency * offset / SAMPLE_RATE)
                result[start + offset] = (wave * envelope * Short.MAX_VALUE * 0.55).toInt().toShort()
            }
        }
        return result
    }

    private data class Tone(val frequency: Double, val startMs: Int, val durationMs: Int)

    private companion object { const val SAMPLE_RATE = 44_100 }
}
