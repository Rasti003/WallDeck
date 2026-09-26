package pl.home.wallpanel

import android.app.*
import android.content.*
import android.os.*
import android.provider.Settings
import kotlinx.coroutines.flow.MutableSharedFlow

object PowerEvents { val events = MutableSharedFlow<String>(extraBufferCapacity = 16) }
class PowerService : Service() {
    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val event = when (intent.action) {
                Intent.ACTION_POWER_CONNECTED -> "powerConnected"
                Intent.ACTION_POWER_DISCONNECTED -> "powerDisconnected"
                else -> "batteryChanged"
            }
            PowerEvents.events.tryEmit(event)
            if (event == "powerConnected") {
                if (Settings.canDrawOverlays(this@PowerService)) {
                    runCatching { startActivity(panelIntent()) }
                }
                getSystemService(NotificationManager::class.java).notify(1, notification("Podłączono zasilanie — dotknij, aby otworzyć panel"))
            }
        }
    }
    private fun panelIntent() = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    private fun notification(text: String): Notification = Notification.Builder(this, "dock")
        .setSmallIcon(android.R.drawable.ic_lock_idle_charging).setContentTitle("WallDeck — monitor zasilania")
        .setContentText(text).setOngoing(true).setContentIntent(PendingIntent.getActivity(this, 0, panelIntent(), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)).build()
    override fun onCreate() {
        super.onCreate()
        getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel("dock", "Monitor zasilania", NotificationManager.IMPORTANCE_LOW))
        startForeground(1, notification("Monitor aktywny — dotknij, aby otworzyć panel"))
        val filter = IntentFilter().apply { addAction(Intent.ACTION_POWER_CONNECTED); addAction(Intent.ACTION_POWER_DISCONNECTED); addAction(Intent.ACTION_BATTERY_CHANGED) }
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(receiver, filter, RECEIVER_NOT_EXPORTED) else registerReceiver(receiver, filter)
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int) = START_STICKY
    override fun onDestroy() { unregisterReceiver(receiver); super.onDestroy() }
    override fun onBind(intent: Intent?) = null
}
