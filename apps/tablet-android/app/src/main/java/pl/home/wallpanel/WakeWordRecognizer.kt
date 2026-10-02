package pl.home.wallpanel

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.RecognitionListener
import org.vosk.android.SpeechService
import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.text.Normalizer
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.zip.ZipInputStream

/** Continuous, fully local Polish wake-word recognition backed by Vosk. */
class WakeWordRecognizer(
    private val context: Context,
    private val onWake: (JSONObject) -> Unit,
    private val onStatus: (JSONObject) -> Unit,
) : RecognitionListener {
    private val handler = Handler(Looper.getMainLooper())
    private val worker = Executors.newSingleThreadExecutor()
    private val preparing = AtomicBoolean(false)
    private var model: Model? = null
    private var speech: SpeechService? = null
    private var enabled = false
    private var suspended = false
    private var listening = false
    private var phrase = "ej waldek"
    private var state = "idle"
    private var progress = 0
    private var generation = 0
    private var lastTranscript = ""

    fun configure(shouldEnable: Boolean, wakePhrase: String): JSONObject {
        phrase = normalize(wakePhrase).ifEmpty { "ej waldek" }
        enabled = shouldEnable
        suspended = !shouldEnable
        generation++
        if (enabled) ensureStarted(generation) else stopListening("disabled")
        return status()
    }

    fun pause() {
        suspended = true
        generation++
        stopListening("paused")
    }

    fun resume() {
        suspended = false
        if (enabled) ensureStarted(generation)
    }

    fun stop() {
        enabled = false
        suspended = true
        generation++
        stopListening("disabled")
    }

    fun destroy() {
        stop()
        worker.execute {
            model?.close()
            model = null
        }
        worker.shutdown()
    }

    fun status(): JSONObject = JSONObject()
        .put("enabled", enabled)
        .put("listening", listening)
        .put("localAvailable", true)
        .put("modelReady", model != null)
        .put("permission", hasPermission())
        .put("phrase", phrase)
        .put("state", state)
        .put("progress", progress)
        .put("engine", "vosk-pl")
        .put("lastTranscript", lastTranscript.takeLast(120))

    private fun hasPermission(): Boolean = ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.RECORD_AUDIO,
    ) == PackageManager.PERMISSION_GRANTED

    private fun ensureStarted(expectedGeneration: Int) {
        if (!enabled || suspended || !hasPermission()) {
            publish(if (hasPermission()) "disabled" else "permission-required")
            return
        }
        if (model != null) {
            startListening(expectedGeneration)
            return
        }
        if (!preparing.compareAndSet(false, true)) return
        publish("model-preparing")
        worker.execute {
            try {
                val directory = WakeWordModelInstaller(context) { percent ->
                    progress = percent
                    handler.post { publish("model-downloading") }
                }.prepare()
                val loaded = Model(directory.absolutePath)
                handler.post {
                    model = loaded
                    preparing.set(false)
                    progress = 100
                    publish("model-ready")
                    if (enabled && !suspended) startListening(generation)
                }
            } catch (error: Exception) {
                preparing.set(false)
                handler.post { publish("model-error", error.message ?: error.javaClass.simpleName) }
            }
        }
    }

    private fun startListening(expectedGeneration: Int) {
        if (!enabled || suspended || expectedGeneration != generation || listening || !hasPermission()) return
        val loaded = model ?: return
        try {
            val recognizer = if (phrase == DEFAULT_PHRASE) {
                Recognizer(loaded, SAMPLE_RATE, DEFAULT_GRAMMAR)
            } else {
                Recognizer(loaded, SAMPLE_RATE, "[${JSONObject.quote(phrase)}, \"[unk]\"]")
            }
            speech = SpeechService(recognizer, SAMPLE_RATE).also { service ->
                listening = true
                publish("listening")
                service.startListening(this)
            }
        } catch (error: Exception) {
            listening = false
            publish("audio-error", error.message ?: error.javaClass.simpleName)
            handler.postDelayed({ if (enabled && !suspended && expectedGeneration == generation) startListening(expectedGeneration) }, 1_500)
        }
    }

    private fun stopListening(nextState: String) {
        listening = false
        val current = speech
        speech = null
        runCatching { current?.stop() }
        runCatching { current?.shutdown() }
        publish(nextState)
    }

    private fun inspect(hypothesis: String, key: String) {
        if (!enabled || !listening) return
        val transcript = runCatching { JSONObject(hypothesis).optString(key) }.getOrDefault("")
        val normalized = normalize(transcript)
        if (normalized.isNotEmpty()) lastTranscript = normalized
        val matched = findWakeMatch(normalized) ?: return
        val index = normalized.indexOf(matched)
        val remainder = normalized.substring(index + matched.length).trim(' ', ',', '.', '!', '?')
        generation++
        stopListening("detected")
        onWake(
            JSONObject()
                .put("phrase", phrase)
                .put("transcript", transcript)
                .put("remainder", remainder)
                .put("local", true)
                .put("engine", "vosk-pl"),
        )
    }

    private fun wakeVariants(): List<String> = if (phrase == "ej waldek") {
        listOf("ej waldek", "hej waldek", "ej valdek", "hej valdek", "ej waldku", "hej waldku")
    } else listOf(phrase)

    private fun findWakeMatch(transcript: String): String? {
        wakeVariants().firstOrNull { transcript.contains(it) }?.let { return it }
        if (phrase != DEFAULT_PHRASE) return null
        val words = transcript.split(' ').filter { it.isNotBlank() }
        for (index in 0 until words.lastIndex) {
            if (words[index] !in setOf("ej", "hej", "i")) continue
            val name = words[index + 1]
            if (name.startsWith("wald") || editDistance(name, "waldek") <= 2) {
                return "${words[index]} $name"
            }
        }
        return null
    }

    private fun editDistance(left: String, right: String): Int {
        var previous = IntArray(right.length + 1) { it }
        left.forEachIndexed { leftIndex, leftChar ->
            val current = IntArray(right.length + 1)
            current[0] = leftIndex + 1
            right.forEachIndexed { rightIndex, rightChar ->
                current[rightIndex + 1] = minOf(
                    current[rightIndex] + 1,
                    previous[rightIndex + 1] + 1,
                    previous[rightIndex] + if (leftChar == rightChar) 0 else 1,
                )
            }
            previous = current
        }
        return previous[right.length]
    }

    private fun normalize(value: String): String = Normalizer.normalize(
        value.lowercase(Locale("pl", "PL")),
        Normalizer.Form.NFD,
    )
        .replace("\\p{Mn}+".toRegex(), "")
        .replace("[^a-z0-9 ]".toRegex(), " ")
        .replace("\\s+".toRegex(), " ")
        .trim()

    private fun publish(nextState: String, error: String? = null) {
        state = nextState
        val data = status()
        if (error != null) data.put("error", error.take(240))
        onStatus(data)
    }

    override fun onPartialResult(hypothesis: String) = inspect(hypothesis, "partial")
    override fun onResult(hypothesis: String) = inspect(hypothesis, "text")
    override fun onFinalResult(hypothesis: String) {
        inspect(hypothesis, "text")
        if (speech != null) {
            listening = false
            speech = null
            publish("recognizer-finished")
            val expectedGeneration = generation
            handler.postDelayed({ if (enabled && !suspended && expectedGeneration == generation) startListening(expectedGeneration) }, 500)
        }
    }
    override fun onError(exception: Exception) {
        listening = false
        speech = null
        publish("recognizer-error", exception.message ?: exception.javaClass.simpleName)
        val expectedGeneration = generation
        handler.postDelayed({ if (enabled && !suspended && expectedGeneration == generation) startListening(expectedGeneration) }, 1_500)
    }
    override fun onTimeout() {
        listening = false
        speech = null
        publish("recognizer-timeout")
        val expectedGeneration = generation
        handler.postDelayed({ if (enabled && !suspended && expectedGeneration == generation) startListening(expectedGeneration) }, 500)
    }

    private companion object {
        const val SAMPLE_RATE = 16_000f
        const val DEFAULT_PHRASE = "ej waldek"
        const val DEFAULT_GRAMMAR = "[\"ej waldek\", \"hej waldek\", \"ej valdek\", \"hej valdek\", \"ej waldku\", \"hej waldku\", \"[unk]\"]"
    }
}

private class WakeWordModelInstaller(
    context: Context,
    private val onProgress: (Int) -> Unit,
) {
    private val root = File(context.filesDir, "wake-word")
    private val target = File(root, MODEL_NAME)
    private val archive = File(root, "$MODEL_NAME.zip")
    private val staging = File(root, "extracting")

    fun prepare(): File {
        if (File(target, READY_MARKER).isFile) return target
        root.mkdirs()
        download()
        verify()
        extract()
        File(target, READY_MARKER).writeText(MODEL_SHA256)
        archive.delete()
        onProgress(100)
        return target
    }

    private fun download() {
        if (archive.isFile && archive.length() == MODEL_BYTES) return
        archive.delete()
        val temporary = File(root, "$MODEL_NAME.download")
        temporary.delete()
        val connection = URL(MODEL_URL).openConnection() as HttpURLConnection
        connection.connectTimeout = 15_000
        connection.readTimeout = 30_000
        connection.instanceFollowRedirects = true
        connection.setRequestProperty("User-Agent", "WallDeck-Android/0.1")
        connection.inputStream.use { input ->
            FileOutputStream(temporary).use { output ->
                val buffer = ByteArray(128 * 1024)
                var copied = 0L
                var lastProgress = -1
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    output.write(buffer, 0, count)
                    copied += count
                    val percent = (copied * 100 / MODEL_BYTES).toInt().coerceIn(0, 99)
                    if (percent >= lastProgress + 2) {
                        lastProgress = percent
                        onProgress(percent)
                    }
                }
            }
        }
        connection.disconnect()
        require(temporary.length() == MODEL_BYTES) { "Niepełny model Vosk (${temporary.length()}/$MODEL_BYTES)" }
        require(temporary.renameTo(archive)) { "Nie można zapisać modelu Vosk" }
    }

    private fun verify() {
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(archive).use { input ->
            val buffer = ByteArray(128 * 1024)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                digest.update(buffer, 0, count)
            }
        }
        val actual = digest.digest().joinToString("") { "%02x".format(it) }
        require(actual.equals(MODEL_SHA256, ignoreCase = true)) { "Błędna suma SHA-256 modelu Vosk" }
    }

    private fun extract() {
        staging.deleteRecursively()
        staging.mkdirs()
        val canonicalRoot = staging.canonicalFile.toPath()
        ZipInputStream(BufferedInputStream(FileInputStream(archive))).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                val output = File(staging, entry.name).canonicalFile
                require(output.toPath().startsWith(canonicalRoot)) { "Niebezpieczna ścieżka w archiwum modelu" }
                if (entry.isDirectory) output.mkdirs() else {
                    output.parentFile?.mkdirs()
                    FileOutputStream(output).use { zip.copyTo(it, 128 * 1024) }
                }
                zip.closeEntry()
            }
        }
        val extracted = File(staging, MODEL_NAME)
        require(extracted.isDirectory && File(extracted, "am/final.mdl").isFile) { "Nieprawidłowa zawartość modelu Vosk" }
        target.deleteRecursively()
        require(extracted.renameTo(target)) { "Nie można aktywować modelu Vosk" }
        staging.deleteRecursively()
    }

    private companion object {
        const val MODEL_NAME = "vosk-model-small-pl-0.22"
        const val MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-small-pl-0.22.zip"
        const val MODEL_BYTES = 52_979_372L
        const val MODEL_SHA256 = "c4cd16498ea544f446f9e9a55cbd602b71cfe5a2b6f2b0834d81e1b6fce15f0d"
        const val READY_MARKER = ".wallpanel-ready"
    }
}
