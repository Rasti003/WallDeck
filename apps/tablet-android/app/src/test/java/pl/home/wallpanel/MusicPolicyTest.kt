package pl.home.wallpanel

import org.junit.Assert.*
import org.junit.Test

class MusicPolicyTest {
    @Test fun authorizesOnlyExplicitSpotifyBindingsOnModernAndroid() {
        val action = "com.spotify.mobile.appprotocol.action.BIND_PROTOCOL_SERVICE"
        assertTrue(MusicPolicy.allowAuthActivity(true, 36, "com.spotify.music", action))
        assertFalse(MusicPolicy.allowAuthActivity(false, 36, "com.spotify.music", action))
        assertFalse(MusicPolicy.allowAuthActivity(true, 33, "com.spotify.music", action))
        assertFalse(MusicPolicy.allowAuthActivity(true, 36, "other.app", action))
        assertFalse(MusicPolicy.allowAuthActivity(true, 36, "com.spotify.music", "other.action"))
    }
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
