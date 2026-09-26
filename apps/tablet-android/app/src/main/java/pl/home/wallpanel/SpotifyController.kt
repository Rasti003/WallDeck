package pl.home.wallpanel

import android.app.Activity
import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import android.util.Base64
import com.spotify.android.appremote.api.ConnectionParams
import com.spotify.android.appremote.api.Connector
import com.spotify.android.appremote.api.SpotifyAppRemote
import com.spotify.protocol.client.Subscription
import com.spotify.protocol.types.PlayerContext
import com.spotify.protocol.types.PlayerState
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/** Controls Spotify's player; never owns audio focus or stops playback on close. */
class SpotifyController(private val activity: Activity, private val changed: (JSONObject) -> Unit) {
    private val handler = Handler(Looper.getMainLooper())
    private var remote: SpotifyAppRemote? = null
    private var playerSubscription: Subscription<PlayerState>? = null
    private var contextSubscription: Subscription<PlayerContext>? = null
    private var generation = 0
    private var connectingClient = ""
    private var connection = "disconnected"
    private var error: String? = null
    private var player: PlayerState? = null
    private var context: PlayerContext? = null
    private var coverKey: String? = null
    private var artwork: String? = null
    private var measuredAt = System.currentTimeMillis()
    private var canPlayOnDemand = false

    private fun emit() = changed(state())
    fun state(): JSONObject {
        if (connection == "connected" && remote?.isConnected != true) connection = "disconnected"
        val p = player
        val track = p?.track
        return JSONObject().put("connection", connection).put("error", error ?: JSONObject.NULL)
            .put("installed", SpotifyAppRemote.isSpotifyInstalled(activity))
            .put("paused", p?.isPaused ?: true).put("positionMs", p?.playbackPosition ?: 0)
            .put("observedAt", measuredAt).put("speed", p?.playbackSpeed ?: 1f)
            .put("shuffle", p?.playbackOptions?.isShuffling ?: false).put("repeat", p?.playbackOptions?.repeatMode ?: 0)
            .put("context", context?.title ?: "").put("artwork", artwork ?: JSONObject.NULL)
            .put("track", if (track == null) JSONObject.NULL else JSONObject().put("uri", track.uri)
                .put("title", track.name).put("artist", track.artists?.joinToString(", ") { it.name } ?: track.artist?.name ?: "")
                .put("album", track.album?.name ?: "").put("durationMs", track.duration))
            .put("capabilities", JSONObject().put("queue", false).put("playlists", false).put("like", false)
                .put("playOnDemand", canPlayOnDemand).put("next", p?.playbackRestrictions?.canSkipNext ?: false)
                .put("previous", p?.playbackRestrictions?.canSkipPrev ?: false).put("seek", p?.playbackRestrictions?.canSeek ?: false)
                .put("shuffle", p?.playbackRestrictions?.canToggleShuffle ?: false)
                .put("repeatTrack", p?.playbackRestrictions?.canRepeatTrack ?: false)
                .put("repeatContext", p?.playbackRestrictions?.canRepeatContext ?: false))
    }

    fun connect(clientId: String, authorize: Boolean): JSONObject {
        require(MusicPolicy.validClientId(clientId)) { "INVALID_CLIENT_ID" }
        if (!SpotifyAppRemote.isSpotifyInstalled(activity)) {
            error = "SPOTIFY_NOT_INSTALLED"; connection = "error"; emit(); return state()
        }
        if (connectingClient == clientId && (connection == "connecting" || (connection == "connected" && remote?.isConnected == true))) return state()
        disconnect()
        connectingClient = clientId
        connection = "connecting"; error = null
        val attempt = generation
        val params = ConnectionParams.Builder(clientId).setRedirectUri(MusicPolicy.REDIRECT_URI).showAuthView(authorize).build()
        SpotifyAppRemote.connect(activity, params, object : Connector.ConnectionListener {
            override fun onConnected(appRemote: SpotifyAppRemote) {
                if (attempt != generation) { SpotifyAppRemote.disconnect(appRemote); return }
                remote = appRemote; connection = "connected"; error = null
                playerSubscription = appRemote.playerApi.subscribeToPlayerState().also { subscription ->
                    subscription.setEventCallback { if (attempt == generation) updatePlayer(it) }
                    subscription.setErrorCallback { if (attempt == generation) fail("PLAYER_CONNECTION_LOST") }
                }
                contextSubscription = appRemote.playerApi.subscribeToPlayerContext().also { subscription ->
                    subscription.setEventCallback { if (attempt == generation) { context = it; emit() } }
                    subscription.setErrorCallback { /* Player state remains usable without context. */ }
                }
                appRemote.userApi.capabilities.setResultCallback { if (attempt == generation) { canPlayOnDemand = it.canPlayOnDemand; emit() } }
                    .setErrorCallback { /* Account-specific controls remain restricted. */ }
                emit()
            }
            override fun onFailure(throwable: Throwable) { if (attempt == generation) fail("SPOTIFY_" + throwable.javaClass.simpleName.replace(Regex("[^A-Za-z0-9_]"), "").take(80)) }
        })
        handler.postDelayed({ if (attempt == generation && connection == "connecting") { disconnect(); fail("SPOTIFY_CONNECT_TIMEOUT") } }, 60_000)
        return state()
    }

    private fun fail(code: String) { connection = "error"; error = code; emit() }
    private fun updatePlayer(next: PlayerState) {
        player = next; measuredAt = System.currentTimeMillis(); error = null
        val key = next.track?.imageUri?.raw
        if (key != coverKey) {
            coverKey = key; artwork = null
            val attempt = generation
            if (!key.isNullOrEmpty()) remote?.imagesApi?.getImage(next.track.imageUri)?.setResultCallback { bitmap ->
                if (generation == attempt && coverKey == key) {
                    val bytes = ByteArrayOutputStream()
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 85, bytes)
                    artwork = "data:image/jpeg;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP)
                    emit()
                }
            }?.setErrorCallback { /* Retain the artwork placeholder; never reuse the previous cover. */ }
        }
        emit()
    }

    fun command(action: String, args: JSONObject, done: (JSONObject?, String?) -> Unit) {
        val api = remote?.takeIf { it.isConnected }?.playerApi ?: run { done(null, "SPOTIFY_NOT_CONNECTED"); return }
        val result = when (action) {
            "play" -> api.resume()
            "pause" -> api.pause()
            "next" -> api.skipNext()
            "previous" -> api.skipPrevious()
            "seek" -> { val position = args.getDouble("positionMs"); require(MusicPolicy.validPosition(position)); api.seekTo(position.toLong()) }
            "shuffle" -> api.setShuffle(args.getBoolean("enabled"))
            "repeat" -> { val mode = args.getInt("mode"); require(mode in 0..2); api.setRepeat(mode) }
            "playContext" -> { val uri = args.getString("uri"); require(MusicPolicy.validContext(uri)); api.play(uri) }
            "addToQueue" -> { val uri = args.getString("uri"); require(MusicPolicy.validContext(uri) && uri.startsWith("spotify:track:")); api.queue(uri) }
            else -> { done(null, "UNSUPPORTED_MUSIC_ACTION"); return }
        }
        result.setResultCallback { done(JSONObject().put("ok", true), null) }.setErrorCallback { done(null, "SPOTIFY_COMMAND_FAILED") }
    }

    fun disconnect(): JSONObject {
        generation++
        playerSubscription?.cancel(); contextSubscription?.cancel()
        playerSubscription = null; contextSubscription = null
        remote?.let { SpotifyAppRemote.disconnect(it) }; remote = null
        connection = "disconnected"; connectingClient = ""; player = null; context = null; artwork = null; coverKey = null
        canPlayOnDemand = false; error = null; emit()
        return state()
    }
}
