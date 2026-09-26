package pl.home.wallpanel

/** Future extension contracts. Spotify's implemented adapter lives in SpotifyController. */
interface WallPanelModule { val id: String; val available: Boolean; fun close() }
interface WakeWordModule : WallPanelModule { suspend fun start(onWake: (String) -> Unit); suspend fun stop() }
interface MediaModule : WallPanelModule { suspend fun play(mediaId: String); suspend fun pause() }
interface HomeAutomationModule : WallPanelModule { suspend fun execute(entity: String, action: String) }
