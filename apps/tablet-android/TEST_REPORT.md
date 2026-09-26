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
