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

Frontend ma rejestr niezależnych widoków. Serwer przechowuje identyfikator aktywnego widoku, udostępnia `POST /api/views/activate` i rozsyła zmianę do paneli przez WebSocket. Manager widoków mapuje zdarzenia na akcje i przechowuje reguły w ustawieniach. Pierwsza konfiguracja obsługuje `tap photos → ha`, `swipeDown photos → ha` oraz `30 s bezczynności → photos`. APK rozpoznaje przesunięcie zaczęte w górnych 40% WebView i przekazuje je jako `wallpanel:swipeDown`; zwykła przeglądarka ma odpowiednik pointer events. Aktywność zwykłej strony jest wykrywana przez zdarzenia przeglądarki; dotyk wewnątrz cross-origin iframe HA przekazuje APK jako `wallpanel:userInteraction`. Pierwszy widok `photos` wybiera układ na podstawie orientacji ekranu: poziomy ekran pokazuje jedno zdjęcie poziome albo dwa pionowe, a pionowy ekran stosuje regułę odwrotną. `/admin` ma nawigację sekcyjną i konfiguruje widoki bez umieszczania odnośnika na ekranie tabletu.

Konfiguracja każdego widoku zawiera docelową jasność okna. Po zmianie aktywnego widoku frontend wywołuje metodę `brightness` Android Bridge; pozwala to przyciemniać przyszłe widoki nocne bez zmiany globalnej jasności systemu.

WallDeck Server jest jedynym klientem Home Assistant. Konfigurację podaje się w `/admin`; token Long-Lived Access Token jest szyfrowany AES-256-GCM, a klucz znajduje się w osobnym pliku danych runtime. Publiczne API zwraca tylko stan `configured` i diagnostykę, nigdy token. Adapter pobiera początkowy snapshot encji, subskrybuje `state_changed` przez WebSocket i automatycznie ponawia połączenie. Dowolne encje można dodać do overlayu, opisać własną etykietą i rozmieścić w sześciu strefach ekranu. Widok `ha` osadza skonfigurowany dashboard. Na obecnej instancji HA osadzanie jest włączone przez `http.use_x_frame_options: false`; po zmianie konfiguracja została zweryfikowana, HA uruchomiony ponownie, a `/ha` sprawdzony z ekranem logowania dashboardu.

## Prototyp twarzy asystenta

Serwowanie frontendu: `registerClient` rozwiązuje pliki dynamicznie, również po przebudowie Vite w działającym serwerze. HTML ma `Cache-Control: no-cache`; fallback HTML obejmuje tylko znane trasy SPA. Nieznane API i brakujące assety zwracają 404, aby przeglądarka nie otrzymała HTML zamiast modułu JavaScript.

Specyfikacja: [Notion, sekcja 15](https://www.notion.so/3e7827a850e3816ab406dabf341c372a). Widok `assistant-demo` dołącza do wspólnego rejestru widoków, walidacji API, reguł i jasności per widok. Trasa `/assistant-demo` wymusza lokalny podgląd; aktywacja przez API pokazuje go na zwykłym `/panel`.

Podział odpowiedzialności: `assistant-state.ts` zawiera jawną maszynę stanów i mapowanie audio, `AssistantFace` renderuje osobne oczy, brwi, nos, usta i akcenty przez SVG + Motion, a `AssistantDemoView` dostarcza kontrolki oraz testowy poziom audio. To samodzielny prototyp bez powiązania z voice pipeline. Timer losowych mikroanimacji i timer audio są zwalniane przy odmontowaniu; nie powstaje historia próbek audio. Tryb sleep obniża intensywność grafiki, natomiast jasność okna pochodzi ze wspólnego mechanizmu per widok.

## Przepływ uwierzytelnienia urządzenia (docelowy)

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

### Aktywność klientów

Obecny prototyp ma wspólny aktywny widok dla podłączonych paneli. Komunikat WebSocket `panel.activity` synchronizuje reset licznika bezczynności, aby dodatkowa karta panelu nie przełączała aktywnie używanego tabletu. Reguły dotyku i bezczynności są wyłączone w wymuszonym podglądzie `/ha`. Docelowe profile wielu urządzeń powinny rozdzielać widoki i aktywność per Device ID.

Android Activity działa w immersive fullscreen i ukrywa paski systemowe. Android zachowuje systemową kontrolę nad gestem rozpoczętym dokładnie na krawędzi; HyperOS może wtedy przejściowo pokazać status bar. Trwałe wyłączenie panelu powiadomień będzie wymagało zarządzanego trybu Device Owner/lock task.
