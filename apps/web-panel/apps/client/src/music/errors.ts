export function musicErrorMessage(code: string | null): string {
  switch (code) {
    case "SPOTIFY_UserNotAuthorizedException":
      return "Spotify nie udzieliło WallDeck zgody na sterowanie. Sprawdź w Spotify Developer Dashboard pakiet Android, SHA-1, Redirect URI oraz dostęp konta. Następnie połącz ponownie i zatwierdź zgodę na tablecie.";
    case "SPOTIFY_NotLoggedInException":
      return "Zaloguj się w aplikacji Spotify na tym tablecie, potem połącz ponownie.";
    case "SPOTIFY_AuthenticationFailedException":
      return "Spotify odrzuciło uwierzytelnienie. Sprawdź Client ID, Redirect URI i rejestrację pakietu Android z SHA-1.";
    case "SPOTIFY_OfflineModeException":
      return "Wyłącz tryb offline w Spotify i sprawdź połączenie tabletu z Internetem.";
    case "SPOTIFY_NOT_INSTALLED":
    case "SPOTIFY_CouldNotFindSpotifyApp":
      return "Zainstaluj lub zaktualizuj Spotify na tablecie.";
    case "SPOTIFY_CONNECT_TIMEOUT":
      return "Spotify nie odpowiedziało w ciągu minuty. Otwórz Spotify, sprawdź połączenie i spróbuj ponownie.";
    default:
      return "Nie udało się połączyć ze Spotify. Otwórz Spotify na tablecie i spróbuj ponownie.";
  }
}
