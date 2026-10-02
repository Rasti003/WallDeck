# Plan rozwoju

## Gotowe

- [x] monorepo dla sprzętu, Androida i systemu WWW;
- [x] prototyp APK na Kotlinie;
- [x] konfigurowalny WebView i ukryty konfigurator;
- [x] szyfrowany storage oraz HMAC challenge;
- [x] bridge z allowlistą originu i izolacją iframe;
- [x] podstawowe capabilities urządzenia;
- [x] obsługa podłączenia i odłączenia zasilania;
- [x] strona diagnostyczna bridge;
- [x] test na Xiaomi z Androidem 16 przez ADB Wi-Fi.
- [x] diagnostyka urządzenia w `/admin`: bateria, ekran, uprawnienia i pełny katalog sensorów przez bridge v2;
- [x] reguła wybrana encja HA / sensor / kamera → `sleep` z histerezą oraz dotknięcie `sleep` → Home Assistant;
- [x] opcjonalny fallback jasności z przedniej kamery dla HyperOS blokującego SensorManager;
- [x] plan architektury i technologii WallDeck Web;
- [x] prototyp synchronizacji shared albumu Google Photos i pierwsze lokalne lustro 119 zdjęć;
- [x] React/Vite client, Fastify server i współdzielone kontrakty Zod;
- [x] pierwszy widok albumu z układem zależnym od orientacji zdjęć;
- [x] dyskretny overlay i osobny panel administratora;
- [x] zdalne wywoływanie konkretnego widoku przez API i WebSocket;
- [x] jasność tabletu konfigurowana osobno dla każdego widoku;
- [x] centralny adapter Home Assistant REST/WebSocket z reconnectem;
- [x] szyfrowana, trwała konfiguracja HA w panelu `/admin`;
- [x] uniwersalny wybór wielu encji HA, etykiety, sześć stref overlayu i aktualizacja w czasie rzeczywistym;
- [x] osobny widok dashboardu Home Assistant pod `/ha`;
- [x] skalowalny panel administratora z nawigacją sekcyjną;
- [x] manager widoków: album otwiera HA, a bezczynność prowadzi przez 10 s asystenta idle do albumu; dotyk przerywa sekwencję i wraca do HA;
- [x] immersive fullscreen w APK i konfigurowalna reguła własnego gestu przesunięcia w dół;

## Najbliższy etap

- [x] sekcja Asystent w adminie, 14 min z indywidualną jasnością, opcjonalna wspólna jasność i ciemny sen;

- [x] usunąć spokojny wariant asystenta po wyborze ekspresyjnego; zachować migrację dawnych reguł i adresu demo;

- [x] zachować spokojny wariant asystenta i dodać ekspresyjną kopię z mocniejszą mimiką i ruchem wirtualnej głowy;

- [x] prototyp SVG + Motion twarzy asystenta: osiem stanów, nieregularne mikroanimacje, usta sterowane audio, studio `/assistant-demo` i integracja z managerem widoków;
- [ ] wielogodzinny test pamięci i płynności animacji asystenta na docelowym WebView;

- [x] wybrać stack właściwego panelu WWW;
- [x] utworzyć React/Vite client, Fastify server i wspólne kontrakty Zod;
- [ ] przygotować maszynę trybów UI w XState;
- [ ] włączyć dobowy harmonogram i „Synchronizuj teraz” dla shared albumu Google Photos;
- [x] włączyć lokalny katalog zdjęć do API WallDeck Server i slideshow;
- [ ] przygotować HTTPS i DNS w homelabie;
- [x] przygotować kontener produkcyjny, Compose, trwałe katalogi danych i instrukcję wdrożenia na VM;
- [ ] zaimplementować backend rejestracji urządzeń i sesji;
- [x] zaprojektować pierwszy pełnoekranowy widok panelu;
- [ ] wykonać fizyczny test ładowarki, autostartu i polityk HyperOS;
- [ ] wdrożyć Device Owner/lock task, jeżeli panel powiadomień ma być całkowicie niedostępny;
- [ ] zaprojektować uchwyt pod dokładne wymiary tabletu i wtyku USB-C.

## Później

- [ ] rozszerzyć Home Assistant o komendy, sceny i semantyczne modele pomieszczeń;
- [ ] odtwarzacz YouTube wewnątrz panelu;
- [x] pierwszy adapter Spotify App Remote, MusicController, Music View, Home, konfiguracja Client ID/jasności i diagnostyka wyjść;
- [ ] Client ID + autoryzacja Spotify i fizyczny test playbacku → Bluetooth, sterowania i odtwarzania po zmianie widoku;
- [ ] prawdziwy Up Next przez dodatkowy adapter/autoryzację, playlisty i search;
- [ ] like/favorite, animacje prawdziwej kolejki/shared element i długotrwały test 60 fps;
- [x] transport MusicController dla MCP/automatyzacji przez command bus WebSocket;
- [x] chroniony tokenem serwer MCP z osobnymi przełącznikami narzędzi w panelu administratora;
- [ ] połączenie MCP z OpenAI Responses API przez Secure MCP Tunnel/HTTPS;
- [ ] audio focus/duck/pause/resume asystenta;
- [ ] routing audio tablet/Bluetooth;
- [x] lokalny wake word on-device i natywny bufor PCM; dokładniejsze KWS/VAD pozostaje do ewaluacji;
- [x] tekstowy Luna/MCP → GPT-Live z budżetem, twardym limitem sesji i fallbackiem OpenAI TTS;
- [x] prototyp „Ej Waldek” → mikrofon tabletu → GPT-Live → głośnik, z delegacją do Luny/MCP;
- [ ] dopracować barge-in, echo cancellation oraz ewaluację jakości wake wordu; ciągła fraza bez wymaganej pauzy ma już bufor przed otwarciem GPT-Live;
- [ ] zastąpić diagnostyczny klaster głosu zweryfikowanym lokalnym modelem speaker verification i rejestracją profili;
- [ ] provider ElevenLabs z szyfrowanym kluczem i wyborem polskiego Voice ID;
- [ ] aktualizacja konfiguracji i modeli bez wydawania nowego APK.

- [x] rozróżnienie błędów połączenia Spotify; potwierdzono na tablecie UserNotAuthorizedException, autoryzacja nadal wymaga dokończenia.

- [x] poprawka blokady okna zgody Spotify na Androidzie 14+ (BIND_ALLOW_ACTIVITY_STARTS dla jawnej autoryzacji).

- [x] Dancing expression with hands, idle return and per-expression brightness.

- [x] Music → HA → bezczynność → taniec → Music podczas playbacku; natychmiastowy powrót dotykiem podczas tańca; fallback po pauzie.

- [x] Automatically show dance -> Music on an observed Spotify playback start, without repeating on track updates.
- [ ] Verify App Remote reports playback started on other devices; otherwise add account-wide Spotify Web API observation.

- [x] Restore an authorized Spotify App Remote session after panel startup without opening consent UI.

- [x] Paused Music: 30 seconds inactivity -> assistant idle -> photos; activity resets timer and playback prevents exit.

- [x] Admin: catalogue of state machines and transitions with current settings and assistant reducer metadata.

- [x] Prepare native Device Owner receiver and attempt no-reset provisioning.
- [ ] Resolve provisioning blocker: existing tablet accounts. Full kiosk, native emergency exit and power-disconnect exit remain pending.

- [x] Resolve account blocker and provision WallDeck as Device Owner without reset.
- [ ] Implement and test managed kiosk entry, native emergency exit, tablet-mode button and power-disconnect exit.

- [x] Managed dock kiosk with native tablet-mode button, unplug exit and hardware emergency escape.
- [ ] Integrate native exit with future configurable radial menu.

- [x] Add non-resizable activity and temporary kiosk window restriction.
- [ ] Confirm Xiaomi top-edge floating-window toolbar no longer appears with user gesture.

- [x] User confirmed recovery from HyperOS X via hidden-task handling (task-removed alone was insufficient). OEM toolbar hiding remains unresolved.

- [x] Glass view menu, downward gesture, visible/order settings in admin and inactivity pause.

- [x] Replace persistent large tablet-mode button with discreet menu tablet icon.

- [x] Touch volume popover in Music: slider, minus/plus, mute restore, auto-dismiss.
## Galeria — 2026-09-28

- [x] Gesty poziome, historia zestawów i menu po przytrzymaniu.
- [x] Kolekcja i pobieranie na tablecie oraz w adminie.
- [x] Niedestrukcyjny obrót, ukrywanie, kadr per orientacja i podgląd tabletu/pary.
- [x] Globalna kolejka powiadomień oraz aktualizacja kolekcji po synchronizacji.
- [ ] Wirtualizacja siatki dla bardzo dużych bibliotek (obecnie leniwe miniatury i strony po 60).
## Powiadomienia — 2026-09-28

- [x] Globalna konfiguracja czasu zwykłego komunikatu.
- [x] Alarm trwały lub czasowy, z pierwszeństwem w kolejce.
- [x] Opcjonalne lokalne dźwięki oraz regulacja ich głośności.
- [x] Próbki zwykłego powiadomienia i alarmu w adminie.
- [ ] TTS z ciszą nocną, wyborem głosu i audio focus.
