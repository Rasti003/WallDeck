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
- [x] plan architektury i technologii WallDeck Web;

## Najbliższy etap

- [x] wybrać stack właściwego panelu WWW;
- [ ] utworzyć React/Vite client, Fastify server i wspólne kontrakty Zod;
- [ ] przygotować maszynę trybów UI w XState;
- [ ] zgłosić WallDeck do Google Photos Partner Program dla Ambient API;
- [ ] przygotować Ambient API oraz awaryjne źródła Picker/Google Drive;
- [ ] przygotować HTTPS i DNS w homelabie;
- [ ] zaimplementować backend rejestracji urządzeń i sesji;
- [ ] zaprojektować główny interfejs panelu;
- [ ] wykonać fizyczny test ładowarki, autostartu i polityk HyperOS;
- [ ] zaprojektować uchwyt pod dokładne wymiary tabletu i wtyku USB-C.

## Później

- [ ] Home Assistant;
- [ ] odtwarzacz YouTube wewnątrz panelu;
- [ ] sterowanie Spotify;
- [ ] routing audio tablet/Bluetooth;
- [ ] lokalny wake word, VAD i bufor audio;
- [ ] STT → LLM → TTS na homelabie;
- [ ] aktualizacja konfiguracji i modeli bez wydawania nowego APK.
