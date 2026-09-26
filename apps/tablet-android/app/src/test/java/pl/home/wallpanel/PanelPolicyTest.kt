package pl.home.wallpanel

import org.junit.Assert.*
import org.junit.Test

class PanelPolicyTest {
    @Test fun normalizesDefaultPort() { assertEquals("https://panel.home", PanelPolicy.origin("https://PANEL.home:443/panel")) }
    @Test fun rejectsSecretBearingUrls() {
        listOf("https://u:pass@panel.home", "https://panel.home/?key=secret", "https://panel.home/#secret", "file:///etc/passwd", "javascript:alert(1)").forEach {
            assertTrue(it, runCatching { PanelPolicy.origin(it) }.isFailure)
        }
    }
    @Test fun isolatesOrigin() {
        val trusted = "https://panel.home"
        assertTrue(PanelPolicy.sameOrigin("https://panel.home:443/a?q=x", trusted))
        listOf("https://panel.home.evil/a", "http://panel.home", "https://panel.home:444", "https://evil@panel.home", "data:text/html,hi").forEach {
            assertFalse(it, PanelPolicy.sameOrigin(it, trusted))
        }
    }
    @Test fun requiresSecureTransportForSecrets() {
        assertFalse(PanelPolicy.secureForKey("http://192.168.1.2:8080"))
        assertTrue(PanelPolicy.secureForKey("http://127.0.0.1:8080"))
        assertTrue(PanelPolicy.secureForKey("https://panel.home"))
    }
}
