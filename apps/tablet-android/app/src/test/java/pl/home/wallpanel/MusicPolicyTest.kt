package pl.home.wallpanel

import org.junit.Assert.*
import org.junit.Test

class MusicPolicyTest {
    @Test fun rejectsUrlsAndCredentials() {
        assertTrue(MusicPolicy.validClientId("0123456789abcdef0123456789abcdef"))
        assertFalse(MusicPolicy.validClientId("client-secret"))
        assertTrue(MusicPolicy.validContext("spotify:track:6rqhFgbbKwnb9MLmUQDhG6"))
        assertFalse(MusicPolicy.validContext("https://example.com/token"))
        assertFalse(MusicPolicy.validContext("intent://spotify"))
    }
    @Test fun requiresFiniteBoundedSeekPosition() {
        assertTrue(MusicPolicy.validPosition(0.0))
        assertTrue(MusicPolicy.validPosition(120000.0))
        assertFalse(MusicPolicy.validPosition(-1.0))
        assertFalse(MusicPolicy.validPosition(Double.NaN))
        assertFalse(MusicPolicy.validPosition(Double.POSITIVE_INFINITY))
        assertFalse(MusicPolicy.validPosition(86400001.0))
    }
}
