package pl.home.wallpanel

/** No credentials, arbitrary intents or URLs are accepted by the music bridge. */
object MusicPolicy {
    fun allowAuthActivity(authorize: Boolean, sdk: Int, targetPackage: String?, action: String?) =
        authorize && sdk >= 34 && targetPackage == "com.spotify.music" && action in setOf(
            "com.spotify.mobile.appprotocol.action.BIND_PROTOCOL_SERVICE",
            "com.spotify.mobile.appprotocol.action.START_APP_PROTOCOL_SERVICE",
        )
    const val REDIRECT_URI = "walldeck://spotify-callback"
    fun validClientId(value: String) = value.matches(Regex("[a-fA-F0-9]{32}"))
    fun validContext(value: String) = value.matches(Regex("spotify:(track|album|playlist|artist):[A-Za-z0-9]{22}"))
    fun validPosition(value: Double) = value.isFinite() && value >= 0 && value <= 86_400_000 && value % 1 == 0.0
}
