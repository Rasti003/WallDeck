package pl.home.wallpanel

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StorageTest {
    @Test fun keystoreDataStoreRoundtrip() = runBlocking {
        // Test APK context keeps the user's actual configuration untouched.
        val context = InstrumentationRegistry.getInstrumentation().context
        val store = ConfigStore(context)
        val cfg = PanelConfig("https://test.invalid", "test-device", "test-secret-42", false)
        store.save(cfg)
        assertEquals(cfg, store.load())
        val files = java.io.File(context.filesDir, "datastore").listFiles()!!
        assertTrue(files.isNotEmpty())
        files.forEach { assertFalse(it.readBytes().toString(Charsets.ISO_8859_1).contains(cfg.deviceKey)) }
    }
}
