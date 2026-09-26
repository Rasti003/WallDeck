package pl.home.wallpanel

import android.Manifest
import android.app.AlertDialog
import android.content.*
import android.content.pm.PackageManager
import android.graphics.Color
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.media.AudioManager
import android.net.Uri
import android.os.*
import android.provider.Settings
import android.text.InputType
import android.view.*
import android.webkit.*
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import androidx.webkit.*
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.json.JSONArray
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

class MainActivity : ComponentActivity() {
    private lateinit var root: FrameLayout
    private var tabletButton: Button? = null
    private var leavingKiosk = false
    private val emergencyHandler = Handler(Looper.getMainLooper())
    private val emergencyExit = Runnable { exitToTablet() }
    private var web: WebView? = null
    private var config: PanelConfig? = null
    private var dialog: AlertDialog? = null
    private var reply: JavaScriptReplyProxy? = null
    private var trusted = ""
    private var cornerTaps = 0
    private var lastTap = 0L
    private var swipeStartX = 0f
    private var swipeStartY = 0f
    private var swipeStartedAt = 0L
    private val store by lazy { ConfigStore(applicationContext) }
    private val audio by lazy { getSystemService(AudioManager::class.java) }
    private val music by lazy { SpotifyController(this) { state -> runOnUiThread { event("musicStateChanged", state) } } }
    private val audioOutputs by lazy { AudioOutputs(this) }
    private val sensorManager by lazy { getSystemService(SensorManager::class.java) }
    private val cameraLightSampler by lazy {
        CameraLightSampler(this) { level -> runOnUiThread { event("cameraLightChanged", JSONObject().put("brightnessPercent", level)) } }
    }
    private val lightSensor by lazy { sensorManager.getSensorList(Sensor.TYPE_ALL).firstOrNull { it.type == Sensor.TYPE_LIGHT } }
    @Volatile private var ambientLightLux: Float? = null
    private val lightListener = object : SensorEventListener {
        override fun onSensorChanged(sensorEvent: SensorEvent) {
            ambientLightLux = sensorEvent.values.firstOrNull()
            ambientLightLux?.let { event("ambientLightChanged", JSONObject().put("lux", it.toDouble())) }
        }
        override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) = Unit
    }
    private val batteryReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            event("batteryChanged")
            if (config?.dock == true && !battery().optBoolean("powerConnected") && kioskActive()) exitToTablet()
        }
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        getSharedPreferences("kiosk", MODE_PRIVATE).edit().putBoolean("manualExit", false).apply()
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        enterImmersiveMode()
        root = FrameLayout(this).apply { setBackgroundColor(Color.rgb(16, 23, 34)) }
        setContentView(root)
        val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(batteryReceiver, filter, RECEIVER_NOT_EXPORTED) else registerReceiver(batteryReceiver, filter)
        lifecycleScope.launch {
            PowerEvents.events.collect {
                event(it)
                if (it == "powerDisconnected" && config?.dock == true) {
                    // Finishes this task only: Android reveals the previously foreground task.
                    exitToTablet()
                }
            }
        }
        lifecycleScope.launch {
            try {
                val saved = store.load()
                val debugUrl = intent.getStringExtra(DEBUG_PANEL_URL_EXTRA)?.takeIf { BuildConfig.DEBUG }
                config = if (debugUrl != null) {
                    PanelConfig(debugUrl, saved?.deviceId ?: "wallpanel-01", "", saved?.dock ?: true).also { store.save(it) }
                } else saved
                config?.let { showPanel(it) } ?: showConfig()
            }
            catch (_: Exception) { toast("Nie można odszyfrować konfiguracji. Wprowadź ją ponownie."); showConfig() }
        }
    }
    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        if (ev.actionMasked == MotionEvent.ACTION_DOWN) {
            swipeStartX = ev.x
            swipeStartY = ev.y
            swipeStartedAt = SystemClock.elapsedRealtime()
            event("userInteraction", JSONObject().put("kind", "touch"))
        }
        if (ev.actionMasked == MotionEvent.ACTION_UP) {
            val deltaX = ev.x - swipeStartX
            val deltaY = ev.y - swipeStartY
            val elapsed = SystemClock.elapsedRealtime() - swipeStartedAt
            val density = resources.displayMetrics.density
            val startsInUpperArea = swipeStartY <= root.height * 0.4f
            if (startsInUpperArea && deltaY >= 96 * density && kotlin.math.abs(deltaX) <= deltaY * 0.65f && elapsed <= 900) {
                event("swipeDown", JSONObject().put("kind", "swipeDown"))
                enterImmersiveMode()
                return true
            }
        }
        if (ev.actionMasked == MotionEvent.ACTION_UP && ev.x < 72 * resources.displayMetrics.density && ev.y < 120 * resources.displayMetrics.density) {
            val now = SystemClock.elapsedRealtime()
            cornerTaps = if (now - lastTap < 650) cornerTaps + 1 else 1
            lastTap = now
            if (cornerTaps == 7) { cornerTaps = 0; showConfig(); return true }
        }
        return super.dispatchTouchEvent(ev)
    }
    private fun enterImmersiveMode() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            )
    }
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && dialog?.isShowing != true) enterImmersiveMode()
    }
    override fun onResume() {
        super.onResume()
        updateKiosk()
        cameraLightSampler.onResume()
        lightSensor?.let {
            sensorManager.registerListener(lightListener, it, SensorManager.SENSOR_DELAY_NORMAL)
        }
    }
    override fun onPause() {
        emergencyHandler.removeCallbacks(emergencyExit)
        cameraLightSampler.onPause()
        sensorManager.unregisterListener(lightListener)
        super.onPause()
    }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == CAMERA_LIGHT_PERMISSION_REQUEST && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) cameraLightSampler.permissionGranted()
    }
    private fun showConfig() {
        if (dialog?.isShowing == true) return
        val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(28, 20, 28, 20) }
        fun field(label: String, value: String, secret: Boolean = false) = EditText(this).also {
            it.hint = label; it.setText(value); it.isSingleLine = true
            it.inputType = if (secret) InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD else InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            it.importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO
            layout.addView(TextView(this).apply { text = label }); layout.addView(it)
        }
        val url = field("Panel URL", config?.url ?: "http://127.0.0.1:8080")
        val id = field("Device ID", config?.deviceId ?: "wallpanel-01")
        val key = field("Device Key (puste = bez zmiany)", "", true)
        val clearKey = CheckBox(this).apply { text = "Usuń zapisany Device Key" }; layout.addView(clearKey)
        val dock = CheckBox(this).apply { text = "Monitoruj dock / undock"; isChecked = config?.dock ?: true }; layout.addView(dock)
        layout.addView(TextView(this).apply { text = "Konfigurator: 7 szybkich dotknięć lewego górnego rogu. HTTP tylko do testów bez sekretu; klucz wymaga HTTPS lub tunelu localhost. Powrót z tła zależy od uprawnień Androida." })
        layout.addView(Button(this).apply { text = "Zezwól na powrót panelu z tła"; setOnClickListener { startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))) } })
        layout.addView(Button(this).apply { text = "Powiadomienia monitora"; setOnClickListener { if (Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1) } })
        layout.addView(Button(this).apply { text = "Tryb tabletu"; setOnClickListener { exitToTablet() } })
        val scroll = ScrollView(this).apply { addView(layout) }
        dialog = AlertDialog.Builder(this).setTitle("WallDeck • konfiguracja").setView(scroll).setNegativeButton("Anuluj", null).setPositiveButton("Zapisz", null).create()
        dialog!!.setOnShowListener {
            dialog!!.window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
            dialog!!.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                lifecycleScope.launch {
                    try {
                        val cfg = PanelConfig(url.text.toString().trim(), id.text.toString().trim(), if (clearKey.isChecked) "" else key.text.toString().ifEmpty { config?.deviceKey ?: "" }, dock.isChecked)
                        require(cfg.deviceId.matches(Regex("[A-Za-z0-9._-]{1,128}"))) { "Device ID: 1–128 liter ASCII, cyfr, kropek, podkreśleń lub myślników" }
                        require(cfg.deviceKey.length <= 4096) { "Device Key jest zbyt długi" }
                        store.save(cfg); config = cfg; dialog?.dismiss(); showPanel(cfg)
                    } catch (e: Exception) { toast(e.message ?: "Błąd zapisu") }
                }
            }
        }
        dialog!!.show()
    }
    private fun showPanel(cfg: PanelConfig) {
        reply = null
        web?.let { root.removeView(it); it.destroy() }
        trusted = PanelPolicy.origin(cfg.url)
        val view = WebView(this); web = view; root.addView(view)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        view.settings.apply {
            javaScriptEnabled = true; domStorageEnabled = true
            allowFileAccess = false; allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false); javaScriptCanOpenWindowsAutomatically = false
            mediaPlaybackRequiresUserGesture = true
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, false)
        view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                request.url.scheme !in setOf("http", "https") || (request.isForMainFrame && !PanelPolicy.sameOrigin(request.url.toString(), trusted))
            override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                reply = null
                if (!PanelPolicy.sameOrigin(url, trusted)) { view.stopLoading(); toast("Zablokowano obcy origin") }
            }
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) toast("Panel niedostępny. Sprawdź serwer lub URL w konfiguratorze.")
            }
            override fun onReceivedSslError(view: WebView, handler: android.webkit.SslErrorHandler, error: android.net.http.SslError) { handler.cancel(); toast("Nieprawidłowy certyfikat HTTPS") }
        }
        view.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) { request.deny() }
        }
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) { toast("Zaktualizuj Android System WebView — bridge niedostępny"); return }
        WebViewCompat.addWebMessageListener(view, "WallPanelNative", setOf(trusted)) { _, message, origin, mainFrame, proxy ->
            if (mainFrame && PanelPolicy.sameOrigin(origin.toString(), trusted) && PanelPolicy.sameOrigin(view.url ?: cfg.url, trusted)) {
                reply = proxy
                handle(message.data ?: "", proxy)
            }
        }
        if (cfg.dock) startForegroundService(Intent(this, PowerService::class.java)) else stopService(Intent(this, PowerService::class.java))
        view.loadUrl(cfg.url)
        tabletButton?.let { root.removeView(it) }
        tabletButton = Button(this).apply {
            text = "Tryb tabletu"
            contentDescription = "Wyłącz kiosk i wróć do tabletu"
            alpha = 0.65f
            setOnClickListener { exitToTablet() }
        }
        root.addView(tabletButton, FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.END or Gravity.BOTTOM))
        updateKiosk()
    }
    private fun kioskActive() = getSystemService(android.app.ActivityManager::class.java).lockTaskModeState != android.app.ActivityManager.LOCK_TASK_MODE_NONE

    private fun updateKiosk() {
        if (leavingKiosk || config == null) return
        val policy = getSystemService(android.app.admin.DevicePolicyManager::class.java)
        if (!policy.isDeviceOwnerApp(packageName)) return
        val admin = ComponentName(this, WallDeckAdminReceiver::class.java)
        if (config?.dock == true && battery().optBoolean("powerConnected")) {
            if (getSystemService(android.app.KeyguardManager::class.java).isKeyguardLocked) return
            runCatching {
                policy.setLockTaskPackages(admin, arrayOf(packageName, "com.spotify.music"))
                policy.setLockTaskFeatures(admin, android.app.admin.DevicePolicyManager.LOCK_TASK_FEATURE_NONE)
                policy.addUserRestriction(admin, UserManager.DISALLOW_CREATE_WINDOWS)
                if (!kioskActive()) startLockTask()
            }.onFailure {
                policy.clearUserRestriction(admin, UserManager.DISALLOW_CREATE_WINDOWS)
                toast("Nie udało się włączyć kiosku")
            }
        } else if (kioskActive()) runCatching { stopLockTask() }
    }

    private fun exitToTablet() {
        leavingKiosk = true
        getSharedPreferences("kiosk", MODE_PRIVATE).edit().putBoolean("manualExit", true).apply()
        runCatching { if (kioskActive()) stopLockTask() }.onFailure {
            leavingKiosk = false
            getSharedPreferences("kiosk", MODE_PRIVATE).edit().putBoolean("manualExit", false).apply()
            toast("Nie udało się wyłączyć kiosku. Użyj konfiguratora lub ADB.")
            return
        }
        val policy = getSystemService(android.app.admin.DevicePolicyManager::class.java)
        if (policy.isDeviceOwnerApp(packageName)) policy.clearUserRestriction(ComponentName(this, WallDeckAdminReceiver::class.java), UserManager.DISALLOW_CREATE_WINDOWS)
        dialog?.dismiss()
        finishAndRemoveTask()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        leavingKiosk = false
        updateKiosk()
    }

    // Hardware emergency exit works even when the web page is unavailable.
    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN && event.repeatCount == 0) {
            emergencyHandler.removeCallbacks(emergencyExit)
            emergencyHandler.postDelayed(emergencyExit, 2000)
        }
        return super.onKeyDown(keyCode, event)
    }
    override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) emergencyHandler.removeCallbacks(emergencyExit)
        return super.onKeyUp(keyCode, event)
    }

    private fun battery(): JSONObject {
        val b = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = b?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = b?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
        return JSONObject().put("percent", if (level >= 0 && scale > 0) level * 100 / scale else -1)
            .put("powerConnected", (b?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0) != 0)
            .put("charging", b?.getIntExtra(BatteryManager.EXTRA_STATUS, 0) == BatteryManager.BATTERY_STATUS_CHARGING)
    }
    private fun permissions() = JSONObject().put("overlay", Settings.canDrawOverlays(this))
        .put("notifications", getSystemService(android.app.NotificationManager::class.java).areNotificationsEnabled())
        .put("microphone", checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)
        .put("camera", checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
        .put("activityRecognition", if (Build.VERSION.SDK_INT >= 29) checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED else true)
    private fun deviceInfo() = JSONObject()
        .put("manufacturer", Build.MANUFACTURER)
        .put("model", Build.MODEL)
        .put("android", Build.VERSION.RELEASE)
        .put("sdk", Build.VERSION.SDK_INT)
        .put("deviceId", config!!.deviceId)
        .put("screen", JSONObject()
            .put("width", resources.displayMetrics.widthPixels)
            .put("height", resources.displayMetrics.heightPixels)
            .put("densityDpi", resources.displayMetrics.densityDpi))
    private fun sensors(): JSONObject {
        if (ambientLightLux == null) lightSensor?.let {
            sensorManager.registerListener(lightListener, it, SensorManager.SENSOR_DELAY_NORMAL)
        }
        val items = JSONArray()
        sensorManager.getSensorList(Sensor.TYPE_ALL).forEach { sensor ->
            val requiredPermission = if (sensor.type == Sensor.TYPE_STEP_COUNTER || sensor.type == Sensor.TYPE_STEP_DETECTOR) Manifest.permission.ACTIVITY_RECOGNITION else null
            val item = JSONObject()
                .put("name", sensor.name)
                .put("vendor", sensor.vendor)
                .put("type", sensor.type)
                .put("stringType", sensor.stringType)
                .put("version", sensor.version)
                .put("reportingMode", sensor.reportingMode)
                .put("wakeUp", sensor.isWakeUpSensor)
                .put("power", sensor.power.toDouble())
                .put("resolution", sensor.resolution.toDouble())
                .put("maximumRange", sensor.maximumRange.toDouble())
                .put("minDelayUs", sensor.minDelay)
                .put("maxDelayUs", sensor.maxDelay)
                .put("fifoMaxEventCount", sensor.fifoMaxEventCount)
                .put("fifoReservedEventCount", sensor.fifoReservedEventCount)
                .put("requiredPermission", requiredPermission ?: JSONObject.NULL)
            if (sensor.type == Sensor.TYPE_LIGHT) {
                item.put("value", ambientLightLux?.toDouble() ?: JSONObject.NULL).put("unit", "lx")
            }
            items.put(item)
        }
        return JSONObject().put("items", items).put("ambientLightLux", ambientLightLux?.toDouble() ?: JSONObject.NULL)
    }
    private fun handle(raw: String, proxy: JavaScriptReplyProxy) {
        var id: Any = JSONObject.NULL
        try {
            require(raw.length <= 16384) { "MESSAGE_TOO_LARGE" }
            val req = JSONObject(raw); id = req.get("id")
            require(id is String && (id as String).length <= 128) { "INVALID_ID" }
            val args = req.optJSONObject("args") ?: JSONObject()
            if (req.getString("method") == "music.command") {
                val requestId = id
                music.command(args.getString("action"), args) { result, error ->
                    runOnUiThread {
                        // Never deliver account metadata or late replies into a replaced document.
                        if (reply === proxy && web?.url?.let { PanelPolicy.sameOrigin(it, trusted) } == true) {
                            val response = JSONObject().put("id", requestId)
                            if (error == null) response.put("result", result) else response.put("error", error)
                            proxy.postMessage(response.toString())
                        }
                    }
                }
                return
            }
            val result: Any = when (req.getString("method")) {
                "capabilities" -> JSONObject().put("bridgeVersion", 3).put("methods", JSONArray(listOf("capabilities", "deviceInfo", "sensors", "cameraLightSampling", "battery", "brightness", "mediaVolume", "keepAwake", "haptics", "reload", "appVersion", "permissions", "signChallenge", "music.connect", "music.disconnect", "music.getState", "music.command", "music.getQueue", "audio.getOutputs", "audio.selectOutput", "audio.openSystemOutputPicker"))).put("wakeWord", false).put("spotify", true).put("youtube", false).put("homeAssistant", false)
                "music.connect" -> music.connect(args.getString("clientId"), args.optBoolean("authorize", false))
                "music.disconnect" -> music.disconnect()
                "music.getState" -> music.state()
                "music.getQueue" -> JSONObject().put("supported", false).put("reason", "APP_REMOTE_QUEUE_UNAVAILABLE")
                "audio.getOutputs" -> audioOutputs.state()
                "audio.selectOutput" -> JSONObject().put("supported", false).put("fallback", "bluetooth-settings")
                "audio.openSystemOutputPicker" -> audioOutputs.openSystemOutputPicker()
                "deviceInfo" -> deviceInfo()
                "sensors" -> sensors()
                "cameraLightSampling" -> {
                    val enabled = args.optBoolean("enabled", false)
                    val intervalSeconds = args.optInt("intervalSeconds", 30).coerceIn(10, 300)
                    cameraLightSampler.configure(enabled, intervalSeconds)
                    if (enabled && !cameraLightSampler.hasPermission()) runOnUiThread {
                        requestPermissions(arrayOf(Manifest.permission.CAMERA), CAMERA_LIGHT_PERMISSION_REQUEST)
                    }
                    JSONObject().put("requested", enabled).put("permission", cameraLightSampler.hasPermission()).put("intervalSeconds", intervalSeconds)
                }
                "battery" -> battery()
                "appVersion" -> JSONObject().put("name", BuildConfig.VERSION_NAME).put("code", BuildConfig.VERSION_CODE)
                "permissions" -> permissions()
                "brightness" -> {
                    if (args.has("value")) { val v = args.getDouble("value"); require(v == -1.0 || v in 0.0..1.0) { "INVALID_BRIGHTNESS" }; window.attributes = window.attributes.apply { screenBrightness = v.toFloat() } }
                    JSONObject().put("value", window.attributes.screenBrightness)
                }
                "mediaVolume" -> {
                    val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
                    if (args.has("value")) { val v = args.getDouble("value"); require(v in 0.0..1.0) { "INVALID_VOLUME" }; audio.setStreamVolume(AudioManager.STREAM_MUSIC, (v * max).toInt(), 0) }
                    JSONObject().put("value", audio.getStreamVolume(AudioManager.STREAM_MUSIC).toDouble() / max.coerceAtLeast(1))
                }
                "keepAwake" -> {
                    if (args.has("enabled")) { if (args.getBoolean("enabled")) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
                    JSONObject().put("enabled", window.attributes.flags and WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON != 0)
                }
                "haptics" -> { val vibrator = getSystemService(Vibrator::class.java); if (vibrator.hasVibrator()) vibrator.vibrate(VibrationEffect.createOneShot(35, VibrationEffect.DEFAULT_AMPLITUDE)); JSONObject().put("available", vibrator.hasVibrator()) }
                "reload" -> { web?.post { web?.reload() }; JSONObject().put("ok", true) }
                "signChallenge" -> {
                    val cfg = config!!
                    require(cfg.deviceKey.isNotEmpty() && PanelPolicy.secureForKey(cfg.url)) { "AUTH_NOT_CONFIGURED" }
                    val challenge = args.getString("challenge")
                    require(challenge.matches(Regex("[A-Za-z0-9_-]{32,256}"))) { "INVALID_CHALLENGE" }
                    val payload = "wallpanel-v1\n$trusted\n${cfg.deviceId}\n$challenge"
                    val mac = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(cfg.deviceKey.toByteArray(Charsets.UTF_8), "HmacSHA256")) }
                    JSONObject().put("deviceId", cfg.deviceId).put("signature", android.util.Base64.encodeToString(mac.doFinal(payload.toByteArray(Charsets.UTF_8)), android.util.Base64.NO_WRAP))
                }
                else -> error("UNKNOWN_METHOD")
            }
            proxy.postMessage(JSONObject().put("id", id).put("result", result).toString())
        } catch (_: Exception) { proxy.postMessage(JSONObject().put("id", id).put("error", "INVALID_OR_UNAVAILABLE_REQUEST").toString()) }
    }
    private fun event(name: String, data: JSONObject = battery()) {
        if (web?.url?.let { PanelPolicy.sameOrigin(it, trusted) } == true) runCatching {
            reply?.postMessage(JSONObject().put("event", name).put("data", data).toString())
        }
    }
    private fun toast(text: String) = Toast.makeText(this, text, Toast.LENGTH_LONG).show()
    override fun onDestroy() { music.disconnect(); cameraLightSampler.destroy(); sensorManager.unregisterListener(lightListener); unregisterReceiver(batteryReceiver); dialog?.dismiss(); web?.destroy(); web = null; reply = null; super.onDestroy() }

    private companion object {
        const val DEBUG_PANEL_URL_EXTRA = "pl.home.wallpanel.DEBUG_PANEL_URL"
        const val CAMERA_LIGHT_PERMISSION_REQUEST = 2
    }
}
