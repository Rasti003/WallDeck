package pl.home.wallpanel

import android.app.Activity
import android.content.Intent
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject

class AudioOutputs(private val activity: Activity) {
    private val audio = activity.getSystemService(AudioManager::class.java)
    fun state(): JSONObject {
        val devices = audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
        val bluetoothTypes = setOf(AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, AudioDeviceInfo.TYPE_BLUETOOTH_SCO, AudioDeviceInfo.TYPE_BLE_HEADSET, AudioDeviceInfo.TYPE_BLE_SPEAKER)
        return JSONObject().put("outputs", JSONArray(devices.map { device ->
            JSONObject().put("id", device.id.toString()).put("name", device.productName.toString())
                .put("type", device.type).put("bluetooth", device.type in bluetoothTypes)
        })).put("bluetoothAvailable", devices.any { it.type in bluetoothTypes })
            .put("currentOutput", JSONObject.NULL).put("codec", JSONObject.NULL)
            .put("audioFocus", "managed-by-spotify").put("selectOutput", false)
            .put("fallback", "bluetooth-settings")
            .put("volume", audio.getStreamVolume(AudioManager.STREAM_MUSIC).toDouble() / audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1))
    }
    fun openSystemOutputPicker(): JSONObject {
        // Public settings fallback: no private MediaOutput intent and no routing of another app's player.
        activity.startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS))
        return JSONObject().put("opened", "bluetooth-settings").put("selectionConfirmed", false)
    }
}
