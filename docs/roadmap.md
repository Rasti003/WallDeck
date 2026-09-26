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
- [ ] zaimplementować backend rejestracji urządzeń i sesji;
- [x] zaprojektować pierwszy pełnoekranowy widok panelu;
- [ ] wykonać fizyczny test ładowarki, autostartu i polityk HyperOS;
- [ ] wdrożyć Device Owner/lock task, jeżeli panel powiadomień ma być całkowicie niedostępny;
- [ ] zaprojektować uchwyt pod dokładne wymiary tabletu i wtyku USB-C.

## Później

- [ ] rozszerzyć Home Assistant o komendy, sceny i semantyczne modele pomieszczeń;
- [ ] odtwarzacz YouTube wewnątrz panelu;
- [ ] sterowanie Spotify;
- [ ] routing audio tablet/Bluetooth;
- [ ] lokalny wake word, VAD i bufor audio;
- [ ] STT → LLM → TTS na homelabie;
- [ ] aktualizacja konfiguracji i modeli bez wydawania nowego APK.
