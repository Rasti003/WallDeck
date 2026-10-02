package pl.home.wallpanel

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.*
import android.media.audiofx.AcousticEchoCanceler
import android.os.Process
import android.util.Base64
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

class AssistantAudioIo(
    private val context: Context,
    private val onChunk: (String) -> Unit,
    private val onSpeaker: (JSONObject) -> Unit,
) {
    private val sampleRate = 24_000
    private val recording = AtomicBoolean(false)
    private val outputExecutor = Executors.newSingleThreadExecutor()
    private var input: AudioRecord? = null
    private var output: AudioTrack? = null
    private var echoCanceler: AcousticEchoCanceler? = null
    private var inputThread: Thread? = null
    private var observeSpeaker = false
    private val observedSamples = ArrayList<Short>(sampleRate * 4)
    private val clusterer = VoiceClusterer(context)

    fun startInput(speakerObservation: Boolean): JSONObject {
        require(ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) { "MICROPHONE_PERMISSION_REQUIRED" }
        if (recording.getAndSet(true)) return JSONObject().put("recording", true)
        observeSpeaker = speakerObservation
        observedSamples.clear()
        val minimum = AudioRecord.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        require(minimum > 0) { "AUDIO_INPUT_UNAVAILABLE" }
        input = AudioRecord.Builder()
            .setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
            .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(sampleRate).setChannelMask(AudioFormat.CHANNEL_IN_MONO).build())
            .setBufferSizeInBytes(max(minimum * 2, 9_600))
            .build()
        require(input?.state == AudioRecord.STATE_INITIALIZED) { "AUDIO_INPUT_UNAVAILABLE" }
        echoCanceler = if (AcousticEchoCanceler.isAvailable()) AcousticEchoCanceler.create(input!!.audioSessionId)?.apply { enabled = true } else null
        input!!.startRecording()
        inputThread = Thread({ captureLoop() }, "WallDeck-AssistantMic").apply { start() }
        return JSONObject().put("recording", true).put("sampleRate", sampleRate).put("speakerObservation", observeSpeaker)
    }

    fun stopInput(): JSONObject {
        if (!recording.getAndSet(false)) return JSONObject().put("recording", false)
        runCatching { input?.stop() }
        inputThread?.join(750)
        inputThread = null
        input?.release(); input = null
        echoCanceler?.release(); echoCanceler = null
        if (observeSpeaker && observedSamples.size >= sampleRate) {
            clusterer.observe(observedSamples.toShortArray())?.let(onSpeaker)
        }
        observedSamples.clear()
        return JSONObject().put("recording", false)
    }

    private fun captureLoop() {
        Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
        val shorts = ShortArray(2_400)
        while (recording.get()) {
            val count = input?.read(shorts, 0, shorts.size, AudioRecord.READ_BLOCKING) ?: break
            if (count <= 0) continue
            if (observeSpeaker && observedSamples.size < sampleRate * 4) {
                val remaining = sampleRate * 4 - observedSamples.size
                for (i in 0 until min(count, remaining)) observedSamples.add(shorts[i])
            }
            val bytes = ByteArray(count * 2)
            for (i in 0 until count) {
                val value = shorts[i].toInt()
                bytes[i * 2] = (value and 0xff).toByte()
                bytes[i * 2 + 1] = ((value ushr 8) and 0xff).toByte()
            }
            onChunk(Base64.encodeToString(bytes, Base64.NO_WRAP))
        }
    }

    fun startOutput(): JSONObject {
        stopOutput()
        val minimum = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
        output = AudioTrack.Builder()
            .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(sampleRate).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
            .setTransferMode(AudioTrack.MODE_STREAM)
            .setBufferSizeInBytes(max(minimum * 3, 14_400))
            .build()
        val speaker = context.getSystemService(AudioManager::class.java).getDevices(AudioManager.GET_DEVICES_OUTPUTS).firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
        val preferred = speaker != null && output?.setPreferredDevice(speaker) == true
        output?.play()
        return JSONObject().put("playing", true).put("sampleRate", sampleRate).put("route", "tablet-speaker").put("preferredDeviceAccepted", preferred)
    }

    fun appendOutput(base64: String): JSONObject {
        require(base64.length <= 262_144) { "AUDIO_CHUNK_TOO_LARGE" }
        val data = Base64.decode(base64, Base64.DEFAULT)
        outputExecutor.execute { runCatching { output?.write(data, 0, data.size, AudioTrack.WRITE_BLOCKING) } }
        return JSONObject().put("accepted", data.size)
    }

    fun stopOutput(): JSONObject {
        val track = output
        output = null
        runCatching { track?.pause() }
        runCatching { track?.flush() }
        runCatching { track?.release() }
        return JSONObject().put("playing", false)
    }

    fun destroy() {
        stopInput()
        stopOutput()
        outputExecutor.shutdownNow()
    }
}

/** Experimental local clustering. Labels are diagnostic only and never grant permissions. */
private class VoiceClusterer(context: Context) {
    private val preferences = context.getSharedPreferences("speaker-observation", Context.MODE_PRIVATE)

    fun observe(samples: ShortArray): JSONObject? {
        val feature = features(samples) ?: return null
        val clusters = load()
        var best = -1
        var distance = Double.MAX_VALUE
        clusters.forEachIndexed { index, cluster ->
            val next = euclidean(feature, cluster.vector)
            if (next < distance) { distance = next; best = index }
        }
        if (best < 0 || (distance > .24 && clusters.size < 3)) {
            clusters += Cluster("Głos ${clusters.size + 1}", feature, 1)
            best = clusters.lastIndex
            distance = 0.0
        } else {
            val cluster = clusters[best]
            val count = min(cluster.count + 1, 20)
            val weight = 1.0 / count
            cluster.vector = DoubleArray(feature.size) { i -> cluster.vector[i] * (1 - weight) + feature[i] * weight }
            cluster.count = count
        }
        save(clusters)
        return JSONObject()
            .put("label", clusters[best].label)
            .put("confidence", (1.0 - distance / .45).coerceIn(0.0, 1.0))
            .put("experimental", true)
            .put("sampleSeconds", samples.size.toDouble() / 24_000)
    }

    private fun features(samples: ShortArray): DoubleArray? {
        if (samples.size < 24_000) return null
        var sumSquares = 0.0
        var zeroCrossings = 0
        var delta = 0.0
        var peak = 0.0
        var previous = samples[0].toDouble()
        for (sample in samples) {
            val value = sample.toDouble()
            sumSquares += value * value
            peak = max(peak, abs(value))
            if ((value >= 0) != (previous >= 0)) zeroCrossings++
            delta += abs(value - previous)
            previous = value
        }
        val rms = sqrt(sumSquares / samples.size).coerceAtLeast(1.0)
        val pitch = estimatePitch(samples)
        return doubleArrayOf(
            (zeroCrossings.toDouble() / samples.size).coerceIn(0.0, .5) * 2,
            (delta / samples.size / rms).coerceIn(0.0, 3.0) / 3,
            (peak / rms).coerceIn(1.0, 12.0) / 12,
            (pitch / 400.0).coerceIn(0.0, 1.0),
        )
    }

    private fun estimatePitch(samples: ShortArray): Double {
        val frame = 4_800
        var total = 0.0
        var frames = 0
        var start = 0
        while (start + frame <= samples.size && frames < 12) {
            var bestLag = 0
            var bestScore = Double.NEGATIVE_INFINITY
            for (lag in 60..400 step 4) {
                var score = 0.0
                var energy = 1.0
                var i = 0
                while (i + lag < frame) {
                    val a = samples[start + i].toDouble()
                    val b = samples[start + i + lag].toDouble()
                    score += a * b
                    energy += a * a + b * b
                    i += 4
                }
                val normalized = score / energy
                if (normalized > bestScore) { bestScore = normalized; bestLag = lag }
            }
            if (bestLag > 0) { total += 24_000.0 / bestLag; frames++ }
            start += frame
        }
        return if (frames == 0) 0.0 else total / frames
    }

    private data class Cluster(val label: String, var vector: DoubleArray, var count: Int)
    private fun euclidean(a: DoubleArray, b: DoubleArray): Double = sqrt(a.indices.sumOf { i -> val d = a[i] - b.getOrElse(i) { 0.0 }; d * d })
    private fun load(): MutableList<Cluster> = runCatching {
        val array = JSONArray(preferences.getString("clusters", "[]"))
        MutableList(array.length()) { i ->
            val item = array.getJSONObject(i)
            val values = item.getJSONArray("vector")
            Cluster(item.getString("label"), DoubleArray(values.length()) { values.getDouble(it) }, item.optInt("count", 1))
        }
    }.getOrDefault(mutableListOf())
    private fun save(clusters: List<Cluster>) {
        val array = JSONArray()
        clusters.forEach { cluster -> array.put(JSONObject().put("label", cluster.label).put("count", cluster.count).put("vector", JSONArray(cluster.vector.toList()))) }
        preferences.edit().putString("clusters", array.toString()).apply()
    }
}
