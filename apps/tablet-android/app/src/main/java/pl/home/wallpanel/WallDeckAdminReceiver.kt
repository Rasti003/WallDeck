package pl.home.wallpanel

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.UserManager

class WallDeckAdminReceiver : DeviceAdminReceiver() {
    override fun onLockTaskModeExiting(context: Context, intent: Intent) {
        if (!BuildConfig.MANAGED_KIOSK) return
        val policy = context.getSystemService(DevicePolicyManager::class.java)
        if (policy.isDeviceOwnerApp(context.packageName)) {
            policy.clearUserRestriction(ComponentName(context, WallDeckAdminReceiver::class.java), UserManager.DISALLOW_CREATE_WINDOWS)
        }
    }
}
