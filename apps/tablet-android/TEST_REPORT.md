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
