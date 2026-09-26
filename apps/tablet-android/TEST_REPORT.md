# Weryfikacja prototypu — 2026-09-26

- Build debug APK i APK testowego: PASS, Gradle 8.11.1 / JDK 17, compile/target SDK 35.
- Testy jednostkowe PanelPolicy: 4 PASS, 0 failures.
- Android Lint: 0 błędów; ostrzeżenia obejmują przypięte starsze wersje bibliotek, natywne teksty prototypu, świadomie aktywny JavaScript i analizę obsługi WebViewFeature.
- ADB Wi-Fi: parowanie i połączenie PASS. Tablet zgłasza model `2603ARP14G`, Android 16 (SDK 36), ekran 1280×2048.
- USB: urządzenie nie było widoczne w ADB ani jako tablet w spisie urządzeń USB Windows.
- Instalacja głównego APK przez ADB Wi-Fi: PASS. APK pozostaje też w `Download/WallPanel-0.1-debug.apk`.
- Uruchomienie strony diagnostycznej przez `adb reverse tcp:8080`: PASS.
- Bridge na urządzeniu: PASS dla capabilities, deviceInfo, battery, brightness read/write, mediaVolume read/write, keepAwake read/write, haptics capability, appVersion i permissions.
- Walidacja bridge: PASS — odrzucono wartości poza zakresem, nieznaną metodę oraz nieprawidłowe wyzwanie uwierzytelniające.
- Izolacja bridge: PASS — obcy origin oraz iframe tego samego originu nie otrzymały odpowiedzi natywnej.
- Konfigurator po siedmiu szybkich dotknięciach: PASS.
- Persist konfiguracji po force-stop i ponownym uruchomieniu: PASS.
- Keystore/DataStore: PASS funkcjonalny — testowy Device Key przetrwał restart, wygenerował oczekiwany HMAC-SHA256 i nie występował jawnie w danych aplikacji dostępnych przez `run-as`. Testowy klucz został następnie usunięty; `signChallenge` ponownie zwraca brak konfiguracji.
- Foreground PowerService: PASS, typ `specialUse`, aktywne trwałe powiadomienie.
- Symulowany POWER_CONNECTED: PASS — przy przyznanym overlay aplikacja weszła z launchera na pierwszy plan, a powiadomienie zostało zaktualizowane.
- Symulowany POWER_DISCONNECTED: PASS — Activity zakończone, odsłonięty launcher. Stan baterii przywrócono poleceniem `reset -f`; urządzenie zgłaszało potem AC=false, USB=false.
- Uprawnienia overlay i notifications są obecnie przyznane. Mikrofon/kamera nie są deklarowane ani przyznane. Tablet zgłasza brak wibratora.
- Osobny APK instrumentation test nadal jest blokowany przez HyperOS jako nowy pakiet (`INSTALL_FAILED_USER_RESTRICTED`). Pokrywające go zachowanie storage sprawdzono bezpośrednio w zainstalowanym debug APK jak wyżej.

## Dalsze testy po podłączeniu docelowego serwera

1. Ustawić docelowy URL HTTPS, Device ID i właściwy Device Key.
2. Zweryfikować challenge jednorazowość, wygaśnięcie i Secure/HttpOnly cookie po stronie backendu.
3. Wykonać fizyczny test podłączania oraz odłączania ładowarki; symulacja Androida przeszła, ale nie zastępuje zachowania sprzętu i HyperOS.

## Manager widoków — 2026-09-26

- Urządzenie Xiaomi `2603ARP14G`, Android 16; instalacja aktualizacji przez USB: PASS.
- `assembleDebug`, `testDebugUnitTest`, `lintDebug`: PASS (JDK 21).
- Test na fizycznym WebView przez ADB: tapnięcie ramki aktywuje `ha`.
- Drugie dotknięcie wewnątrz HA zeruje licznik: po kolejnych 20 s nadal `ha`, po 32 s `photos`. Zarejestrowano dwa natywne zdarzenia `userInteraction`.
- Diagnostyka została wykonana przez debug WebView; zrzuty aplikacji są czarne zgodnie z `FLAG_SECURE`.

## Asystent demo — 2026-09-26

Jasność per mimika: Xiaomi 2603ARP14G / Android 16, test ADB/CDP z odczytem natywnej metody brightness: idle=0.65, sleep=0.05, powrót idle=0.65, wspólna jasność wyłączona i brak override=-1, sleep z wyłączoną wspólną=0.05, testowe error=0.23, wyjście do photos=0.22 (zapisany poziom zdjęć). Wszystkie asercje PASS; testowe ustawienia przywrócono w finally. Zapis ustawień z sekcji Asystent zweryfikowano też w przeglądarce.

Po usunięciu spokojnego renderera ponownie wykonano `assistant-smoke.mjs` na Xiaomi 2603ARP14G / Android 16 dla `assistant-expressive`: osiem bazowych stanów, automatyczne przejścia i reakcja ust PASS, brak błędów JavaScript. Krótki pomiar: 599 klatek / około 10 s, mediana 16,7 ms, p95 16,8 ms.

Dodatkowe reakcje, Xiaomi 2603ARP14G / Android 16: przez ADB/CDP wywołano curious, uncertain, confirm, surprised, wink i laughing. Wszystkie wyrenderowane poprawnie; śmiech zmienił ścieżkę ust w czterech kolejnych próbkach i automatycznie wrócił do idle po upływie czasu. PASS.

Animowane wejście/wyjście, Xiaomi 2603ARP14G / Android 16: test ADB/CDP potwierdził wejście `assistant-expressive`, stan `sleep` podczas wyjścia, następnie wyrenderowanie `photos`. Szybkie komendy expressive → ha → expressive zakończyły się na expressive i dokładnie jednym wyrenderowanym widoku. PASS.

Wariant ekspresyjny (`assistant-expressive`), Xiaomi 2603ARP14G / Android 16: powtórzono skrypt `assistant-smoke.mjs` z identyfikatorem nowego widoku. Wszystkie osiem stanów, attention → listening, success → idle i reakcja ust na audio PASS, zero wyjątków JavaScript. Widoczny WebView 1170 × 731 CSS px: 599 klatek w około 10 s, mediana 16,7 ms, p95 i maks. 16,8 ms. Krótki test rAF, bez oceny wielogodzinnej stabilności. Oryginalny renderer spokojnego wariantu pozostaje niezmieniony.

### Ponowne połączenie — 2026-09-26

Xiaomi 2603ARP14G / Android 16: przed poprawką API aktywowało `assistant-demo`, ale DOM WebView pozostawał na `photos` po wcześniejszym restarcie backendu. Po załadowaniu poprawki wykonano kolejny rzeczywisty restart backendu, bez odświeżania WebView. Admin otrzymał snapshot `photos`, a kliknięcie „Asystent demo” w adminie przełączyło fizyczny WebView na `assistant-demo` (potwierdzone odczytem DOM przez ADB/CDP). PASS.

- Xiaomi `2603ARP14G`, Android 16, fizyczny WebView przez ADB/CDP: PASS. Skrypt powtarzalny: `scripts/assistant-smoke.mjs` (wymaga forward portu 9222 do socketu debug WebView i otwartego `/panel`).
- Nowy frontend załadowany bez zmiany APK; aktywacja `assistant-demo` przez API i WebSocket: PASS.
- Osiem stanów, attention → listening po 750 ms, success → idle po 2200 ms: PASS.
- Symulacja audio zmienia geometrię ust: 5 różnych ścieżek w 5 próbkach; brak wyjątków JavaScript.
- Widoczny dokument landscape 1170 × 731 CSS px. Próba rAF podczas speaking: 598 klatek w około 10 s, mediana 16,7 ms, p95 16,8 ms, maksimum 33,4 ms. Jest to krótki pomiar harmonogramu klatek, nie certyfikacja wydajności GPU ani wielogodzinnej stabilności pamięci.

## Immersive fullscreen i gest — 2026-09-26

- `assembleDebug`, `testDebugUnitTest`, `lintDebug`: PASS (JDK 21); aktualizacja APK przez USB: PASS.
- Po uruchomieniu Activity `statusBars` i `navigationBars` miały `visible=false` w diagnostyce systemu.
- Fizyczny gest przesunięcia w dół rozpoczęty poniżej krawędzi: PASS — aktywny widok zmienił się z `photos` na `ha` przez `wallpanel:swipeDown`.
- Gest rozpoczęty dokładnie na górnej krawędzi: ograniczenie platformy potwierdzone — HyperOS chwilowo ustawił systemowe paski jako widoczne i oznaczył je jako transient. Aplikacja zachowała fokus i ponownie ukrywa paski po odzyskaniu kontroli; pełna blokada wymaga Device Owner/lock task.

## Przejście HA → asystent idle → galeria — 2026-09-26

- Test skróconej sekwencji na Xiaomi `2603ARP14G`: `HA → 5 s → assistant-expressive/idle → 3 s → photos` — PASS. Po teście przywrócono konfigurację 30 s + 10 s.
- Przerwanie dotykiem podczas `idle`: PASS — timer galerii anulowany, aktywny widok natychmiast wrócił do HA.
- Widok przejściowy na `/panel` pokazuje samą twarz `idle`, bez kontrolek studia developerskiego.
- Jasność okna w pełnej sekwencji: HA `0.85` → assistant idle `0.65` → photos `0.22` — PASS.
- Typecheck, build, synchronizator oraz 21 testów klienta i 4 testy serwera: PASS.

## 2026-09-26 — diagnostyka urządzenia i sensorów

- `assembleDebug`, `testDebugUnitTest`, `lintDebug`: PASS (JDK 21); aktualizacja APK przez ADB USB: PASS.
- Xiaomi `2603ARP14G`, Android 16 / API 36: raport WebSocket dotarł do `/api/devices`, tablet online, ekran 1280 × 2048 przy 280 dpi, bateria 26%, ładowanie: PASS.
- `SensorManager` zwrócił 22 pozycje: akcelerometr, significant motion, kroki, tilt, orientacja, stationary/motion detect, SAR, pickup, OEM AMD i `camera_light_Sensor`. Zakładkę `/admin` → Urządzenie sprawdzono w przeglądarce: podsumowanie, uprawnienia i wszystkie 22 karty są widoczne.
- Sensor światła istnieje i usługa systemowa raportowała przez ADB około 38,2 lx. Firmware nie utworzył połączenia sensora dla procesu WallDeck, dlatego publiczny Android `SensorManager` zwrócił metadane, ale nie przekazał wartości do APK; admin poprawnie pokazuje „wykryty” bez zmyślonego pomiaru.

## 2026-09-26 — światło → Sen → Home Assistant

- `assembleDebug`, `testDebugUnitTest`, `lintDebug`: PASS (JDK 21); APK z eventem `ambientLightChanged` zainstalowany przez ADB USB.
- Typecheck i build web: PASS; 22 testy klienta, 4 testy serwera i 2 testy synchronizatora: PASS.
- Xiaomi `2603ARP14G`, Android 16: przez CDP w fizycznym WebView zasymulowano 2 lx. Panel przeszedł `photos → assistant-expressive/sleep`; pojedyncze tapnięcie przeszło do `ha`; kolejny odczyt 2 lx nie przerwał HA. Poziom 20 lx ponownie uzbroił regułę. Wszystkie asercje PASS.
- Automatyczne wywołanie z realnego światła pozostaje zależne od firmware: system mierzy lux, ale w tym teście HyperOS nadal nie przekazał wartości procesowi WallDeck.
- Dodatkowy test z fizycznym zasłonięciem kamery/sensora: po chwilowym przywróceniu systemowej automatycznej jasności Android zmienił `mAmbientLux` z 38,25 na 0,0 lx, więc sprzęt reaguje. Wywołanie bridge `sensors` nadal zwróciło `ambientLightLux: null`, a SensorService nie utworzył połączenia dla procesu WallDeck. Potwierdza to ograniczenie HyperOS, a nie awarię czujnika.

## 2026-09-26 — fallback jasności z przedniej kamery

- `assembleDebug`, `testDebugUnitTest`, `lintDebug`: PASS (JDK 21); APK z uprawnieniem kamery zainstalowany przez ADB USB, `CAMERA granted=true`.
- Xiaomi `2603ARP14G`, Android 16: rzeczywisty pomiar z przedniej kamery zwrócił kolejno 12,76%, 13,88% i 13,75% jasności obrazu. Klatki nie opuszczały natywnego samplera.
- Fizyczny WebView/CDP: zdarzenie kamerowe 2% wywołało `photos → assistant-expressive/sleep`; tapnięcie otworzyło `ha`, a kolejny niski pomiar nie przerwał HA. Zdarzenie 20% ponownie uzbroiło regułę. PASS.
- Test wyłączenia: przy interwale 10 s odczyt 13,75% dotarł; po zmianie `cameraEnabled=false` przez 12 s nie pojawił się żaden kolejny event. Ustawienia i widok zdjęć przywrócono. PASS.
- Web: typecheck, build, 22 testy klienta, 4 testy serwera i 2 testy synchronizatora: PASS. Widok admina zawiera osobny przełącznik kamery, progi 5%/15% i interwał 30 s.

## 2026-09-26 — noc sterowana encją Home Assistant

- Xiaomi `2603ARP14G`, Android 16 / API 36, istniejący APK 0.1.0 z nowym frontendem: PASS.
- Kamera została wyłączona przez źródło `home-assistant`; `dumpsys media.camera` potwierdził brak aktywnych klientów kamery po ponownym uruchomieniu aplikacji.
- Test end-to-end użył tymczasowo `sensor.mh_z19_co2_value_2`: stan 522,0 i próg wejścia 523,0 wywołały `photos → assistant-expressive/sleep` po odczycie serwerowym. Fizyczne tapnięcie tabletu wywołało `sleep → ha`. Po teście przywrócono brak wybranej encji i widok `photos`.
- Panel `/admin` sprawdzono w przeglądarce: źródło HA, wyszukiwarka, selektor z bieżącym stanem i jednostką oraz dwa progi są widoczne; wyszukiwanie „oświetlenie” zawęża listę do encji światła.
- Wykryta encja `sensor.esphome_sensors_box1_oswietlenie` ma jednostkę lx, ale podczas testu zwracała `unknown`, dlatego nie została automatycznie zapisana jako źródło.
- Web: build, 23 testy klienta, 4 testy serwera i 2 testy synchronizatora: PASS. APK nie został zmieniony.

### Animowane zasypianie

- Xiaomi `2603ARP14G`, Android 16 / API 36, fizyczny WebView przez ADB/CDP: PASS.
- Testowa encja HA uruchomiła sekwencję `photos → assistant-expressive/idle → sleep`. Pierwsza próbka `idle` pojawiła się po 347 ms, pierwsza próbka `sleep` po 1987 ms; stan spokojny trwał w pomiarze 1640 ms.
- Po teście przywrócono wybraną przez użytkownika encję `sensor.esphome_sensors_box1_oswietlenie`, źródło HA, wyłączoną kamerę i widok `photos`.
- Powtarzalny test znajduje się w `scripts/sleep-entry-smoke.mjs`. Web: typecheck i build PASS; 24 testy klienta, 4 testy serwera i 2 testy synchronizatora PASS. APK nie został zmieniony.
- Po dodaniu konfiguracji czasu powtórzono test z wartością 2,4 s: pierwsze `idle` po 342 ms, `sleep` po 2735 ms, zmierzony odstęp 2393 ms. PASS. Panel admina pokazuje pole „Spokojna twarz przed zaśnięciem” z wartością 1,6 s i zakresem 0,3–10 s. Po teście przywrócono 1,6 s, encję użytkownika i widok zdjęć.

## 2026-09-26 — Music / Spotify, etap bez autoryzacji konta

- Xiaomi 2603ARP14G, Android 16 / API 36, ADB USB: nowy APK z bridge v3 zainstalowany poprawnie.
- `scripts/music-smoke.mjs` na fizycznym WebView: PASS. Spotify jest zainstalowane; stan disconnected przy nieustawionym Client ID.
- Music renderuje się poprawnie, Home otwiera HA, ponowna aktywacja Music pozostawia dokładnie jeden widok. Panel wyjść audio otwiera się i zamyka. Jasność Music odczytana z Androida: 0,65.
- Android zwrócił dwa dostępne wyjścia. Aktywna trasa Spotify pozostaje null; wybór wyjścia i odczyt kolejki jawnie zwracają supported:false. Niepoprawny Client ID został odrzucony.
- Sprawdzono wygląd Music na tablecie oraz sekcję Music w przeglądarce /admin. Po testach przywrócono wcześniejszy widok zdjęć; nie zmieniono konfiguracji nocy ani głośności.
- Android assembleDebug/testDebugUnitTest/lintDebug PASS (0 błędów lint, 23 ostrzeżenia). Web typecheck/build, 27 testów klienta, 4 testy serwera, 2 synchronizatora PASS.
- NIE TESTOWANO: autoryzacji Spotify, rzeczywistych metadanych/okładki, komend playbacku, utrzymania odtwarzania po zmianie widoku, wyjścia BT ani długiego odsłuchu. Wymagane są Client ID i zgoda konta Spotify. Nie oznaczamy kompletnego MVP jako ukończonego.

### Diagnostyka autoryzacji Spotify

- 2026-09-26, Xiaomi 2603ARP14G / Android 16: zainstalowano APK rozróżniający wyjątki SDK. Próba połączenia z zapisanym Client ID i authorize=true zwróciła SPOTIFY_UserNotAuthorizedException. Aplikacja WallDeck była na pierwszym planie. Nie uzyskano autoryzacji; nie wykonano testu playbacku.
- Android assembleDebug/testDebugUnitTest/lintDebug PASS; web typecheck/test/build PASS (27 klient, 4 serwer, 2 synchronizator). Surowe wiadomości wyjątków nie są przekazywane do UI ani logowane przez nasz adapter.

### Poprawka timeoutu okna zgody Spotify — Android 14+

- 2026-09-26, Xiaomi 2603ARP14G / Android 16: log systemowy pokazał BAL_BLOCK dla com.spotify.appauthorization.sso.internalauth.AuthorizationActivityInternalProxy o 20:25:29 i 20:26:36. System blokował wyświetlenie zgody Spotify z powiązanej usługi, co prowadziło do timeoutu WallDeck.
- Przygotowano SpotifyBindingContext z BIND_ALLOW_ACTIVITY_STARTS ograniczonym do jawnej autoryzacji i usługi Spotify. assembleDebug/testDebugUnitTest/lintDebug PASS; test jednostkowy obejmuje odrzucenie innych pakietów, akcji, starszego Androida i authorize=false.
- Próba instalacji poprawionego APK została odrzucona przez tablet: INSTALL_FAILED_USER_RESTRICTED / Install canceled by user. Nie potwierdzono jeszcze działania poprawki na urządzeniu; wymagane ponowienie instalacji po potwierdzeniu użytkownika i test ekranu zgody.
- Po zgodzie użytkownika ponowiono instalację: Success. Próba authorize=true otworzyła rzeczywistą com.spotify.appauthorization.sso.AuthorizationActivity na pierwszym planie tabletu; stan WallDeck: connecting, error=null. Potwierdzono usunięcie blokady wyświetlenia okna. Oczekiwanie na zatwierdzenie zgody przez użytkownika.
- Po zatwierdzeniu zgody: rzeczywisty stan Spotify connected, error=null. Powtórzony music-smoke PASS ze stanem connected; Home/HA i ponowne wejście Music nie zerwały połączenia. Nie uruchamiano odtwarzania w tym teście.

### 2026-09-26 — powrót do Music przez taniec

- Fizyczny Xiaomi 2603ARP14G / Android 16, aktualny APK bez zmian; nowy frontend.
- Rzeczywiste Spotify podczas testu było paused=true: HA wróciło do zdjęć.
- `scripts/music-return-smoke.mjs --simulate-playing` na fizycznym WebView wstrzyknął testowe zdarzenia playbacku, bez uruchamiania dźwięku. PASS: Music → HA (5 s) → dancing (3 s) → Music; dotyk podczas tańca → Music w 37 ms; pauza w trakcie tańca → photos; HA otwarte z photos przy playbacku nadal wraca przez idle do photos.
- Przywrócono oryginalne ustawienia nocy, timeoutów i aktywny widok; usunięto timer testowych zdarzeń. Taniec przy rzeczywistym odtwarzaniu audio nie był w tej próbie testowany.
- Web typecheck/build PASS; istniejące 27 testów klienta, 4 serwera i 2 synchronizatora PASS.

## 2026-09-26: Wi-Fi Spotify diagnosis
Physical Xiaomi 2603ARP14G, Android 16: initial App Remote state disconnected, paused, no track. After frontend update and reload, silent reconnect succeeded: connected, paused, track present. music-start-smoke.mjs PASS: synthetic playing event opens dancing; tap immediately opens Music; settings/view restored. Actual playback from a second device not yet confirmed. Previous music-return-smoke simulation failed waiting for HA because its first synthetic start now triggers auto-navigation; this is not a passing regression test. Web typecheck/build and 35 unit tests PASS.

## 2026-09-26: Paused Music inactivity
Xiaomi 2603ARP14G / Android 16 over Wi-Fi: real Spotify connected and paused. music-idle-smoke.mjs PASS: interaction after 20 seconds resets timer; Music still visible 15 seconds later; after 30 seconds inactivity assistant idle appears, then photos. Test idle duration 3 seconds; original settings and view restored. Web typecheck, 35 tests and build PASS.

## 2026-09-26: No-reset Device Owner attempt
Xiaomi 2603ARP14G, Android 16, Wi-Fi ADB. assembleDebug/testDebugUnitTest/lintDebug PASS; update installation Success. dpm set-device-owner pl.home.wallpanel/.WallDeckAdminReceiver rejected: Not allowed to set the device owner because there are already some accounts on the device. Verified no owners, no enabled device admins, lock task NONE. WallDeck restarted in foreground. No accounts/settings removed and no reset performed.

## 2026-09-26: Device Owner retry succeeded
Physical Xiaomi 2603ARP14G, Android 16 over Wi-Fi. After the user removed remaining accounts, account count was 0. dpm set-device-owner succeeded for pl.home.wallpanel/.WallDeckAdminReceiver. dpm list-owners confirms DeviceOwner on user 0. Lock task remains NONE. No factory reset performed; full kiosk activation and exit lifecycle are not implemented yet.

## 2026-09-26: Managed kiosk lifecycle
Xiaomi 2603ARP14G / Android 16 via Wi-Fi. First build installed successfully. On AC power, lockTaskModeState LOCKED confirmed. Simulated battery unplug returned launcher and NONE; battery reset restored actual AC readings and automatically reopened WallDeck LOCKED. Native bottom-right tablet-mode button returned launcher/NONE. Battery simulation reset verified. Initial Volume Down test failed; replaced repeat-event detection with a 2-second timer canceled on release/pause. Final assembleDebug/testDebugUnitTest/lintDebug PASS. Updated APK installation rejected twice with INSTALL_FAILED_USER_RESTRICTED; final hardware escape fix is built but not installed/tested yet. Tablet left out of kiosk using native exit.

### Final emergency-exit retry
Installation retried with kiosk NONE and launcher foreground: Success, no confirmation dialog required. Launched WallDeck and confirmed LOCKED. Injected KEYCODE_VOLUME_DOWN with duration 2500 ms: launcher foreground and lockTaskModeState NONE, PASS. Then relaunched WallDeck for normal dock use.

## 2026-09-26: Floating-window hardening
assembleDebug/testDebugUnitTest/lintDebug PASS; APK installed after exiting kiosk. Physical tablet reports RESIZE_MODE_UNRESIZEABLE, LOCKED and no_create_windows. Injected top-edge downward swipe left WallDeck foreground and LOCKED. Emergency exit produced NONE and no no_create_windows entries; relaunched WallDeck. Exact Xiaomi toolbar visibility remains for user confirmation.

## 2026-09-26: HyperOS close-button mitigation
User confirmed window sizing blocked but OEM toolbar X still closes WallDeck. Added task-removed recovery with deliberate-exit suppression. assembleDebug/testDebugUnitTest/lintDebug PASS; APK installed successfully over Wi-Fi and WallDeck launched. Actual OEM X recovery awaits user reproduction; toolbar itself is not hidden.
