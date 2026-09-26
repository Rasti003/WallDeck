# Architektura WallDeck

## Podział odpowiedzialności

### Uchwyt ścienny

Zapewnia stabilne mocowanie, łatwe zdjęcie tabletu, doprowadzenie USB-C i bezpieczne chłodzenie. Projekt powinien umożliwiać serwis przewodu oraz wymianę tabletu bez niszczenia ściany.

### Aplikacja Android

Odpowiada wyłącznie za funkcje, których zwykła strona WWW nie może wykonać bezpiecznie i niezawodnie:

- WebView i kontrolę nawigacji;
- przechowywanie konfiguracji urządzenia;
- Android Keystore i podpisywanie wyzwań;
- baterię oraz stan zasilania;
- jasność okna, głośność, keep-awake i haptics;
- cykl zadokowanie/odłączenie;
- przyszłe moduły mikrofonu, wake word i multimediów.

### System WWW

Odpowiada za cały interfejs użytkownika, sceny domu, prezentację danych, komunikację z backendem i przyszłe integracje. Panel wywołuje Android Bridge przez asynchroniczne wiadomości JSON.

Ramka zdjęć korzysta z lokalnego magazynu serwera. Adapter `GooglePhotosSharedAlbumSource` okresowo odczytuje album Google Photos udostępniony przez link, zapisuje nowe oryginały na dysku/NAS i utrzymuje manifest aktywnych elementów. Tablet pobiera zdjęcia wyłącznie z WallDeck Server po LAN-ie. Format strony albumu nie jest oficjalnym API, dlatego zależność pozostaje zamknięta za interfejsem `PhotoSource`.

Frontend ma rejestr niezależnych widoków. Serwer przechowuje identyfikator aktywnego widoku, udostępnia `POST /api/views/activate` i rozsyła zmianę do paneli przez WebSocket. Pierwszy widok `photos` wybiera układ na podstawie orientacji ekranu: poziomy ekran pokazuje jedno zdjęcie poziome albo dwa pionowe, a pionowy ekran stosuje regułę odwrotną. `/admin` konfiguruje slideshow i overlay bez umieszczania odnośnika na ekranie tabletu.

Konfiguracja każdego widoku zawiera docelową jasność okna. Po zmianie aktywnego widoku frontend wywołuje metodę `brightness` Android Bridge; pozwala to przyciemniać przyszłe widoki nocne bez zmiany globalnej jasności systemu.

WallDeck Server jest jedynym klientem Home Assistant. Konfigurację podaje się w `/admin`; token Long-Lived Access Token jest szyfrowany AES-256-GCM, a klucz znajduje się w osobnym pliku danych runtime. Publiczne API zwraca tylko stan `configured` i diagnostykę, nigdy token. Adapter pobiera początkowy snapshot encji, subskrybuje `state_changed` przez WebSocket i automatycznie ponawia połączenie. Wybrany czujnik CO₂ trafia do overlayu, a widok `ha` osadza skonfigurowany dashboard. Standardowy Home Assistant wysyła `X-Frame-Options: SAMEORIGIN`; na docelowym serwerze trzeba więc dopuścić osadzanie dashboardu albo wystawić go przez kontrolowany reverse proxy pod tym samym originem co WallDeck.

## Przepływ uwierzytelnienia urządzenia

1. Backend wystawia krótko żyjące, jednorazowe wyzwanie.
2. Panel przekazuje wyzwanie do `signChallenge` w Android Bridge.
3. APK podpisuje wersję protokołu, origin, Device ID i wyzwanie kluczem przechowywanym lokalnie.
4. Backend weryfikuje HMAC, czas ważności i jednokrotne użycie.
5. Backend wydaje sesję w `Secure`, `HttpOnly` cookie.

Device Key nie jest umieszczany w URL ani zwracany do JavaScriptu.

## Zasilanie

Foreground service obserwuje `POWER_CONNECTED`, `POWER_DISCONNECTED` i zmiany baterii. Po podłączeniu próbuje pokazać panel, jeżeli użytkownik przyznał uprawnienie do wyświetlania nad innymi aplikacjami; zawsze aktualizuje też powiadomienie. Po odłączeniu aktywne Activity kończy się przez `finishAndRemoveTask()`.

Android może ograniczyć start Activity z tła. Xiaomi/HyperOS może dodatkowo wymagać wyłączenia optymalizacji baterii lub zgody na autostart. System nie omija blokady ekranu.

## Przyszłe moduły

Interfejsy `WakeWordModule`, `MediaModule` i `HomeAutomationModule` oddzielają rdzeń APK od przyszłych silników. Docelowy wake word ma działać lokalnie, a STT/LLM/TTS na homelabie. Spotify, YouTube i Home Assistant nie są częścią prototypu 0.1.
