package pl.home.wallpanel

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private val Context.secureData by preferencesDataStore("wallpanel")
data class PanelConfig(val url: String, val deviceId: String, val deviceKey: String, val dock: Boolean = true)
class ConfigStore(private val context: Context) {
    private val slot = stringPreferencesKey("encrypted_config_v1")
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        return (store.getKey("wallpanel.config.v1", null) as? SecretKey) ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("wallpanel.config.v1", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    suspend fun load(): PanelConfig? {
        val raw = context.secureData.data.first()[slot] ?: return null
        val bytes = Base64.decode(raw, Base64.NO_WRAP)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
        val json = JSONObject(String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8))
        return PanelConfig(json.getString("url"), json.getString("id"), json.getString("key"), json.getBoolean("dock"))
    }
    suspend fun save(config: PanelConfig) {
        PanelPolicy.origin(config.url)
        require(config.deviceKey.isEmpty() || PanelPolicy.secureForKey(config.url)) { "Device Key wymaga HTTPS (lub localhost do testów przez ADB)" }
        val json = JSONObject().put("url", config.url).put("id", config.deviceId).put("key", config.deviceKey).put("dock", config.dock)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = Base64.encodeToString(cipher.iv + cipher.doFinal(json.toString().toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
        context.secureData.edit { it[slot] = encrypted }
    }
}
