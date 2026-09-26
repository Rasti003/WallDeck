package pl.home.wallpanel

import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.ServiceConnection
import android.os.Build

/** App Remote 0.8.0 binds through applicationContext without Android 14's auth opt-in. */
class SpotifyBindingContext(context: Context, private val authorize: Boolean) : ContextWrapper(context.applicationContext) {
    override fun getApplicationContext(): Context = this

    override fun bindService(service: Intent, conn: ServiceConnection, flags: Int): Boolean {
        val allowAuth = MusicPolicy.allowAuthActivity(authorize, Build.VERSION.SDK_INT, service.`package`, service.action)
        val bindingFlags = if (Build.VERSION.SDK_INT >= 34 && allowAuth) flags or Context.BIND_ALLOW_ACTIVITY_STARTS else flags
        return super.bindService(service, conn, bindingFlags)
    }
}
