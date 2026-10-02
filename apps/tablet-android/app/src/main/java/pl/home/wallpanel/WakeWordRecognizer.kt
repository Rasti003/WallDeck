package pl.home.wallpanel

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.text.Normalizer
import java.util.Locale

/** Uses Android's on-device recognizer only. It never falls back to network speech recognition. */
class WakeWordRecognizer(
    private val context: Context,
    private val onWake: (JSONObject) -> Unit,
    private val onStatus: (JSONObject) -> Unit,
) : RecognitionListener {
    private val handler = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var enabled = false
    private var listening = false
    private var detected = false
    private var phrase = "ej waldek"
    private var lastState = "idle"
    private val restart = Runnable { if (enabled && !listening) beginListening() }
    private val resultWatchdog = Runnable {
        if (enabled && !detected && !listening) {
            recognizer?.cancel()
            scheduleRestart("result-timeout")
        }
    }
    private val sessionWatchdog = Runnable {
        if (enabled && !detected) {
            listening = false
            recognizer?.cancel()
            scheduleRestart("session-refresh")
        }
    }

    fun configure(shouldEnable: Boolean, wakePhrase: String): JSONObject {
        phrase = normalize(wakePhrase)
        enabled = shouldEnable
        if (!enabled) stop() else beginListening()
        return status()
    }

    fun pause() {
        handler.removeCallbacks(restart)
        handler.removeCallbacks(resultWatchdog)
        handler.removeCallbacks(sessionWatchdog)
        listening = false
        recognizer?.cancel()
        publishStatus("paused")
    }

    fun resume() {
        if (enabled) handler.postDelayed(restart, 350)
    }

    fun stop() {
        enabled = false
        handler.removeCallbacks(restart)
        handler.removeCallbacks(resultWatchdog)
        handler.removeCallbacks(sessionWatchdog)
        listening = false
        recognizer?.cancel()
    }

    fun destroy() {
        stop()
        recognizer?.destroy()
        recognizer = null
    }

    fun status(): JSONObject = JSONObject()
        .put("enabled", enabled)
        .put("listening", listening)
        .put("localAvailable", localAvailable())
        .put("permission", hasPermission())
        .put("phrase", phrase)
        .put("state", lastState)

    private fun localAvailable(): Boolean = Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
    private fun hasPermission(): Boolean = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    @SuppressLint("NewApi") // localAvailable() guards createOnDeviceSpeechRecognizer behind API 31.
    private fun beginListening() {
        handler.removeCallbacks(restart)
        handler.removeCallbacks(resultWatchdog)
        handler.removeCallbacks(sessionWatchdog)
        if (!enabled || listening) return
        if (!hasPermission()) {
            publishStatus("permission-required")
            return
        }
        if (!localAvailable()) {
            publishStatus("local-recognizer-unavailable")
            return
        }
        if (recognizer == null) {
            recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(context).also { it.setRecognitionListener(this) }
        }
        detected = false
        listening = true
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pl-PL")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 250L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 500L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 900L)
            if (Build.VERSION.SDK_INT >= 33) {
                putStringArrayListExtra(
                    RecognizerIntent.EXTRA_BIASING_STRINGS,
                    arrayListOf(wakePhraseForRecognizer(), "Hej Waldek", "Ej Valdek", "Hej Valdek"),
                )
            }
        }
        runCatching { recognizer?.startListening(intent) }
            .onFailure { listening = false; scheduleRestart("start-failed") }
        if (listening) {
            handler.postDelayed(sessionWatchdog, 12_000)
            publishStatus("listening")
        }
    }

    private fun inspect(results: Bundle?) {
        if (detected) return
        val candidates = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
        val match = candidates.firstOrNull { containsWake(it) } ?: return
        detected = true
        handler.removeCallbacks(resultWatchdog)
        handler.removeCallbacks(sessionWatchdog)
        listening = false
        recognizer?.cancel()
        val normalized = normalize(match)
        val index = normalized.indexOf(phrase)
        val remainder = if (index >= 0) normalized.substring(index + phrase.length).trim(' ', ',', '.', '!', '?') else ""
        onWake(JSONObject().put("phrase", phrase).put("transcript", match).put("remainder", remainder).put("local", true))
        publishStatus("detected")
    }

    private fun containsWake(value: String): Boolean {
        val normalized = normalize(value)
        if (normalized.contains(phrase)) return true
        return phrase == "ej waldek" && (normalized.contains("hej waldek") || normalized.contains("ej valdek") || normalized.contains("hej valdek"))
    }

    private fun normalize(value: String): String = Normalizer.normalize(value.lowercase(Locale("pl", "PL")), Normalizer.Form.NFD)
        .replace("\\p{Mn}+".toRegex(), "")
        .replace("[^a-z0-9 ]".toRegex(), " ")
        .replace("\\s+".toRegex(), " ")
        .trim()

    private fun wakePhraseForRecognizer(): String = phrase.split(' ').joinToString(" ") { word ->
        word.replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale("pl", "PL")) else it.toString() }
    }

    private fun scheduleRestart(reason: String) {
        publishStatus(reason)
        handler.removeCallbacks(restart)
        handler.removeCallbacks(resultWatchdog)
        handler.removeCallbacks(sessionWatchdog)
        if (enabled && !detected) handler.postDelayed(restart, 900)
    }

    private fun publishStatus(state: String) {
        lastState = state
        onStatus(status())
    }

    override fun onReadyForSpeech(params: Bundle?) { publishStatus("listening") }
    override fun onBeginningOfSpeech() { publishStatus("speech") }
    override fun onRmsChanged(rmsdB: Float) = Unit
    override fun onBufferReceived(buffer: ByteArray?) = Unit
    override fun onEndOfSpeech() {
        listening = false
        publishStatus("processing")
        handler.removeCallbacks(sessionWatchdog)
        handler.postDelayed(resultWatchdog, 1_500)
    }
    override fun onError(error: Int) {
        listening = false
        handler.removeCallbacks(resultWatchdog)
        handler.removeCallbacks(sessionWatchdog)
        if (!detected) scheduleRestart("error-$error")
    }
    override fun onResults(results: Bundle?) {
        listening = false
        handler.removeCallbacks(resultWatchdog)
        handler.removeCallbacks(sessionWatchdog)
        inspect(results)
        if (!detected) scheduleRestart("no-wake")
    }
    override fun onPartialResults(partialResults: Bundle?) = inspect(partialResults)
    override fun onEvent(eventType: Int, params: Bundle?) = Unit
}
