# Music / Spotify

Status: pierwszy adapter i interfejs wdrożone; autoryzacja konta i rzeczywisty test odtwarzania wymagają Client ID. Specyfikacja: [Notion, sekcja 18](https://www.notion.so/3e7827a850e3816ab406dabf341c372a).

## Konfiguracja

1. W [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) zarejestruj aplikację dla Android App Remote.
2. Dodaj Redirect URI dokładnie `walldeck://spotify-callback`.
3. Dodaj pakiet `pl.home.wallpanel` i SHA-1 certyfikatu instalowanego APK. Dla używanego podczas wdrożenia debug APK: `74:D5:54:C2:EA:54:CA:8B:4C:8A:3B:05:50:15:B9:1B:56:64:42:72`. To publiczny odcisk, nie klucz podpisujący. Inny komputer/klucz lub release wymaga innego wpisu; sprawdź `gradlew signingReport`.
4. Jeżeli aplikacja ma ograniczoną listę użytkowników testowych, dodaj konto używane na tablecie. Dostępność funkcji zależy od konta, trybu aplikacji i aktualnych zasad Spotify.
5. W WallDeck `/admin → Music · Spotify` wklej **Client ID** i zapisz. Nie wprowadzaj Client Secret.
6. Zaloguj się w Spotify na tablecie. Aktywuj Music z admina, naciśnij **Połącz ze Spotify** i zatwierdź zgodę. Po autoryzacji wróć do WallDeck, jeśli wymaga tego system.
7. Wybierz pierwszy utwór lub playlistę w Spotify. WallDeck przejmuje kontrolki i pokazuje aktualny stan. Po restarcie APK w tej wersji połącz ponownie przyciskiem.

## Dostępne funkcje

- Aktualny utwór, wykonawca, album, kontekst, okładka i postęp.
- Play/pause, poprzedni/następny, seek, shuffle i repeat z ograniczeniami playera.
- Kontrakt wywoływalny bez UI: playContext i addToQueue (wyłącznie poprawne URI Spotify); przeglądarka playlist i wyszukiwarka pozostają późniejszym etapem.
- Home → HA; żadna nawigacja sama nie wysyła pause.
- Jasność per widok, odrębna od pozostałych ekranów.
- Lista dostępnych wyjść audio i głośność systemowego strumienia multimediów.
- Systemowe ustawienia Bluetooth jako fallback wyboru wyjścia. Nazwa aktywnej trasy Spotify, kodek i stan jego Audio Focus pozostają nieznane.
- Fade zmiany utworu, przejścia arkuszy, mikroanimacje kontrolek, subtelne tło wyliczone z okładki i respektowanie reduced motion.

## Ograniczenia pierwszego etapu

App Remote nie udostępnia odczytu prawdziwej kolejki. Up Next nie pokazuje fikcyjnych utworów. Kolejka/playlisty wymagają osobnego adaptera i ustalenia autoryzacji Spotify Web API. Like/favorite nie jest włączone. Animacja elementów kolejki będzie wdrożona wraz z rzeczywistymi danymi.

Publiczne Android API nie daje WallDeck pełnej kontroli nad routingiem playera Spotify. `audio.selectOutput` zwraca brak wsparcia; przycisk ustawień nie potwierdza przełączenia głośnika. Spotify może także odtwarzać na urządzeniu Connect poza tabletem — lista lokalnych wyjść nie dowodzi rzeczywistej trasy.

Playback należy do Spotify. Zamknięcie WallDeck/undock rozłącza sterowanie, ale celowo nie pauzuje odtwarzania. Nie dodano finalnego MCP, wake word, mikrofonu ani Audio Focus asystenta. Przyszły koordynator przerwań musi śledzić właściciela pauzy i nie wznawiać muzyki zatrzymanej ręcznie.

## Weryfikacja

Automatyczne: Android assembleDebug/testDebugUnitTest/lintDebug, web typecheck/test/build; `scripts/music-smoke.mjs` na fizycznym WebView testuje stan bez logowania, routing i diagnostykę.

Po autoryzacji należy wykonać: play/pause/seek/skip/shuffle/repeat, aktualizację artwork, Music → HA → photos → Music bez utraty playbacku, utratę/reconnect Spotify, odmowę zgody, przełączenie głośnika i powrót z ustawień, 60-minutowy odsłuch BT i pomiar płynności/pamięci. Na 2026-09-26 testów rzeczywistego playbacku nie wykonano — brak Client ID.

Źródła: [Android SDK setup](https://developer.spotify.com/documentation/android/tutorials/getting-started), [PlayerApi](https://spotify.github.io/android-sdk/app-remote-lib/docs/com/spotify/android/appremote/api/PlayerApi.html), [oficjalny SDK i jego warunki](https://github.com/spotify/android-sdk).

### Diagnostyka połączenia

Błędy Spotify zachowują teraz kategorię wyjątku SDK (bez treści wyjątku, tokenów lub identyfikatorów konta). Music pokazuje osobne wskazówki dla braku zgody, braku logowania, błędu uwierzytelnienia, offline i timeout. UserNotAuthorizedException nie wskazuje jednoznacznie błędnego pola: sprawdź rejestrację Android/package/SHA-1, Redirect URI i dostęp konta, a następnie zgodę app-remote-control.
