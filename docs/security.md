# Bezpieczeństwo

## Granica zaufania

Android Bridge jest dodawany tylko dla dokładnego originu skonfigurowanego panelu i przyjmuje wiadomości wyłącznie z głównej ramki. Nawigacja głównej ramki poza origin jest blokowana. Obcy origin i iframe nie otrzymują odpowiedzi bridge.

WebView ma wyłączony dostęp do `file:` i `content:`, third-party cookies, mieszane treści i automatyczne okna. Błędy certyfikatu TLS kończą połączenie. Mikrofon oraz kamera nie są obecnie udostępniane.

## Sekrety

Konfiguracja jest szyfrowana AES-256-GCM. Klucz szyfrujący jest generowany w Android Keystore, a zaszyfrowane dane trafiają do DataStore. Backup i transfer danych aplikacji są wyłączone. Device Key:

- nie trafia do URL;
- nie jest zwracany do JavaScriptu;
- nie jest logowany;
- może być użyty przez bridge tylko do podpisania prawidłowego wyzwania;
- wymaga HTTPS albo tunelu ADB do localhost podczas developmentu.

Repozytorium nie może zawierać rzeczywistych Device Key, kluczy podpisujących APK, cookies, haseł, linków dających dostęp do prywatnych albumów ani prywatnych plików `.env`/`photo-sync.config.json`.

Udostępniony link Google Photos traktujemy jak sekret o ograniczonym zakresie. Jest przechowywany tylko w konfiguracji serwera, nie trafia do klienta WebView ani logów. Album powinien służyć wyłącznie WallDeckowi; unieważnienie linku w Google Photos odcina synchronizator.

## Odpowiedzialność panelu WWW

Jasność per mimika używa istniejącego zaufanego bridge i dotyczy wyłącznie okna WallDeck. Nie zapisuje globalnej jasności systemu ani nie wymaga nowych uprawnień. Backend waliduje nazwy min oraz zakres 5–100%; fallback -1 jest wyliczany w kliencie jako powrót do ustawień Androida.

Widok asystenta jest demonstracją grafiki. Suwak i generator lokalny są jedynymi źródłami poziomu audio; nie korzysta z mikrofonu, kamery, zewnętrznego TTS ani nowych uprawnień Androida. Do API aktywacji dodano tylko walidowany identyfikator `assistant-demo`.

Wszystkie skrypty uruchamiane przez zaufany origin mają dostęp do bridge. Backend i frontend muszą więc zapobiegać XSS, stosować restrykcyjny CSP, aktualizować zależności oraz wydawać krótkie sesje. Weryfikacja HMAC powinna być stałoczasowa, a każde wyzwanie jednorazowe i szybko wygasające.

Zgodne wstecz rozszerzenia bridge v1 przekazują do zaufanej głównej ramki jedynie rodzaj interakcji: `userInteraction` wysyła `{kind: "touch"}`, a `swipeDown` wysyła `{kind: "swipeDown"}`. Nie przekazują współrzędnych ani treści z HA i nie udostępniają bridge osadzonemu dashboardowi. Komunikat `panel.activity` nie przenosi sekretów; obecne API prototypu pozostaje dostępne w LAN, a sesje urządzeń wymagają osobnego wdrożenia.

Raport diagnostyczny urządzenia zawiera identyfikator panelu, model, wersje, stan baterii, status uprawnień i publiczne metadane sensorów. Nie zawiera Device Key, tokenów, danych konta ani treści z Home Assistant. Raport jest walidowany wspólnym schematem, ma limit 64 KiB i pozostaje tylko w pamięci procesu serwera. Dostęp do `/api/devices` podlega tym samym ograniczeniom sieciowym co obecny prototyp panelu admina.

Zdarzenie `ambientLightChanged` zawiera wyłącznie liczbę lux. Nie uruchamia kamery, nie zapisuje historii pomiarów i jest dostępne tylko zaufanej głównej ramce na zasadach pozostałych eventów bridge.

Fallback kamerowy wymaga jawnego uprawnienia Androida i można go wyłączyć w `/admin`. Surowe klatki pozostają w pamięci APK tylko podczas obliczania średniej luminancji: nie są zapisywane, przesyłane do WebView ani wysyłane na serwer. Bridge przekazuje jedynie liczbę `brightnessPercent`. Kamera jest zamykana po trzeciej klatce, po wyłączeniu ustawienia i po przejściu aplikacji w tło. Android może pokazywać systemowy wskaźnik prywatności podczas krótkiego pomiaru.

Immersive fullscreen ogranicza przypadkowe wejście do interfejsu systemowego, ale nie stanowi zabezpieczenia kiosku. Android może przejściowo odsłonić paski gestem z krawędzi. Pełna blokada panelu powiadomień wymaga kontrolowanego wdrożenia Device Owner i lock task.
