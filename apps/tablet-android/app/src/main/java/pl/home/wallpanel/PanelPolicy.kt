package pl.home.wallpanel

import java.net.URI
import java.util.Locale

object PanelPolicy {
    fun origin(value: String): String {
        val uri = URI(value)
        val scheme = uri.scheme?.lowercase(Locale.ROOT)
        require(scheme == "http" || scheme == "https") { "Wymagany URL http lub https" }
        require(uri.rawUserInfo == null && uri.rawQuery == null && uri.rawFragment == null) { "URL nie może zawierać loginu, parametrów ani fragmentu" }
        val host = uri.host?.lowercase(Locale.ROOT) ?: error("Brak poprawnego hosta")
        require(uri.port == -1 || uri.port in 1..65535) { "Niepoprawny port" }
        val port = if (uri.port == -1 || uri.port == if (scheme == "https") 443 else 80) "" else ":${uri.port}"
        return "$scheme://$host$port"
    }
    fun sameOrigin(value: String, trusted: String): Boolean = runCatching {
        val uri = URI(value)
        origin(URI(uri.scheme, null, uri.host, uri.port, uri.path, null, null).toString()) == trusted && uri.rawUserInfo == null
    }.getOrDefault(false)
    fun secureForKey(url: String): Boolean = URI(url).let { it.scheme == "https" || it.host == "127.0.0.1" || it.host == "localhost" || it.host == "[::1]" }
}
