# WallDeck Android 0.1

Cienka aplikacja Android: Kotlin 2.1, AndroidX WebKit, coroutines, DataStore i Android Keystore. Android 9+, compile/target SDK 35, AGP 8.9.2, Gradle 8.11.1, JDK 17–23. Adapter Spotify App Remote kontroluje aplikację Spotify. Bridge v6 dodaje lokalny wake word oraz natywny tor PCM rozmowy; HA obsługuje panel WWW.

## Uruchomienie

GitHub Actions pobiera SDK Spotify skryptem `scripts/setup-spotify.ps1` i weryfikuje jego SHA-256 przed budowaniem, testami jednostkowymi i lintem. Brak tego kroku powodował błąd `Missing Spotify SDK` na czystym runnerze, mimo poprawnych lokalnych buildów.

Przed pierwszym buildem uruchom `./scripts/setup-spotify.ps1`. Skrypt pobiera oficjalny Spotify App Remote 0.8.0, sprawdza przypięty SHA-256 i zapisuje AAR w ignorowanym katalogu `app/libs`. Biblioteka podlega warunkom Spotify: [SDK i licencja](https://github.com/spotify/android-sdk). Pliku SDK nie commitujemy.

1. Otwórz projekt w Android Studio lub ustaw `JAVA_HOME` i `sdk.dir` w lokalnym `local.properties`; wykonaj `./gradlew assembleDebug testDebugUnitTest lintDebug` (Windows: `gradlew.bat`).
2. `adb devices -l`. Dla Wi-Fi: `adb pair IP:PORT_PAROWANIA` (kod wpisz interaktywnie), następnie `adb connect IP:PORT_DEBUGOWANIA`. Porty są różne i mogą się zmieniać.
3. `scripts/install.ps1 -Serial SERIAL -Adb SCIEZKA_DO_ADB` instaluje APK, tworzy tunel localhost:8080 i otwiera aplikację.
4. W katalogu `../web-panel` uruchom `./run.ps1`. W aplikacji zapisz domyślny `http://127.0.0.1:8080`, Device ID, pusty Device Key. Tunel działa również przez sparowane ADB Wi-Fi. Serwer i połączenie ADB muszą pozostać aktywne.
5. Konfigurator otwiera **7 szybkich dotknięć lewego górnego rogu** (odstęp poniżej 650 ms). Przy pierwszym uruchomieniu otwiera się automatycznie.

W debug APK adres panelu można ustawić również przez jawny intent ADB. Mechanizm działa wyłącznie, gdy `BuildConfig.DEBUG=true`, czyści testowy Device Key i zapisuje URL w szyfrowanym storage:

```powershell
adb shell am force-stop pl.home.wallpanel
adb shell am start -n pl.home.wallpanel/.MainActivity --es pl.home.wallpanel.DEBUG_PANEL_URL "http://192.168.31.59:8787/panel"
```

## Bezpieczeństwo i kontrakt bridge

`../web-panel/wallpanel.js` udostępnia `await WallPanel.call(method, args)`. Transport: `WallPanelNative.postMessage(JSON.stringify({id: '1', method: 'battery', args: {}}))`; odpowiedź przez `onmessage`: `{id,result}` lub `{id,error}`. Wersja protokołu: 6, zgodna wstecz. Metody `deviceInfo` i `sensors` zwracają rozmiar ekranu oraz katalog sensorów Androida; dla sensora światła `value` zawiera luks, jeśli firmware pozwala aplikacji odebrać pomiar. `cameraLightSampling` włącza krótkie, okresowe pomiary luminancji przednią kamerą i wymaga uprawnienia `CAMERA`; wyłączenie zamyka aktywną sesję. Eventy obejmują także `wakeWordDetected`, `wakeWordStatus`, `assistantAudioChunk` i `speakerObserved`. Po przeładowaniu dokument tworzy nową sesję bridge.

Metody audio: `wakeWord.configure/status/pause/resume`, `assistantAudio.startInput/stopInput` i `assistantAudio.startOutput/appendOutput/stopOutput`. Wake word używa ciągłego, lokalnego Vosk z polskim modelem `vosk-model-small-pl-0.22` i wymaga `RECORD_AUDIO`. Przy pierwszym włączeniu APK pobiera oficjalny model 50,5 MiB, sprawdza przypiętą sumę SHA-256 i rozpakowuje go do prywatnego katalogu aplikacji. PCM rozmowy ma format mono 16-bit 24 kHz. Pozostałe metody: capabilities, deviceInfo, battery, appVersion, permissions, brightness (`value`: -1 = systemowa, 0..1), mediaVolume (`value`: 0..1), keepAwake (`enabled`: boolean), haptics, reload i signChallenge.

Activity działa w trybie immersive fullscreen i ponownie ukrywa paski systemowe po odzyskaniu fokusu. Przesunięcie w dół rozpoczęte w górnych 40% WebView emituje `wallpanel:swipeDown`; domyślnie manager widoków używa go do przejścia z albumu do Home Assistant. Próg gestu to 96 dp, a limit czasu 900 ms. Gest rozpoczęty dokładnie na górnej krawędzi nadal należy do Androida i na HyperOS może chwilowo odsłonić pasek systemowy. Całkowita blokada panelu powiadomień wymaga wdrożenia tabletu jako Device Owner w trybie kiosk/lock task.

Bridge korzysta z origin allowlist AndroidX, weryfikuje origin i odrzuca wywołania z iframe. Nie ma `addJavascriptInterface`, wildcardów, dostępu file/content, ignorowania błędów TLS ani dostępu do mikrofonu/kamery. Nawigacja poza origin jest blokowana. Zaufany serwer odpowiada za bezpieczeństwo wszystkich skryptów swojego originu (w szczególności XSS). Debugowanie WebView jest aktywne tylko w debug APK.

Cała konfiguracja jest szyfrowana AES-256/GCM (losowy IV) przed zapisem w DataStore. Klucz szyfrujący pozostaje w Android Keystore; backup wyłączony. Device Key nigdy nie jest zwracany przez bridge ani dodawany do URL. Nie logujemy konfiguracji. Pola formularza nie są zapisywane przez autofill, ekran jest chroniony przed zrzutami. Puste pole klucza zachowuje poprzednią wartość; checkbox pozwala ją usunąć. Po utracie klucza Keystore trzeba ponownie wprowadzić konfigurację.

HTTP jest dopuszczone dla prototypowego panelu; ruch i bridge na takim originie nie są chronione przed ingerencją sieci. Sekret można zapisać wyłącznie dla HTTPS lub localhost (tunel ADB). URL konfiguracji nie może zawierać userinfo, query ani fragmentu. Docelowo użyj HTTPS z certyfikatem akceptowanym przez Androida.

### Przyszłe uwierzytelnienie homelabu

Nie ma jeszcze backendu ani gotowej sesji logowania. Jest kontrakt `signChallenge`: serwer wystawia jednorazowy kryptograficzny challenge (32–256 znaków base64url), strona przekazuje go do bridge, który zwraca Device ID i podpis base64 HMAC-SHA256. Podpisywany tekst UTF-8 to `wallpanel-v1\nORIGIN\nDEVICE_ID\nCHALLENGE`. Backend musi zweryfikować podpis stałoczasowo, oczekiwany origin i ID, termin ważności i jednokrotne użycie challenge, a następnie wydać Secure/HttpOnly session cookie. Sekret nie opuszcza aplikacji. Sam prototyp nie udaje działającej autoryzacji bez serwera.

## Dock / undock

Zapis konfiguracji z włączonym monitorem uruchamia foreground service typu specialUse z trwałym powiadomieniem i dynamicznym odbiornikiem zasilania. Monitor startuje z widocznej Activity; nie uruchamiamy go automatycznie po restarcie systemu. Po force-stop/reboot aplikację trzeba otworzyć ponownie. Wyłączenie monitora w konfiguratorze zatrzymuje usługę.

Po POWER_CONNECTED monitor próbuje otworzyć Activity, jeżeli przyznano uprawnienie wyświetlania nad innymi aplikacjami. Bez tego pozostaje powiadomienie z przyciskiem otwarcia. Uprawnienie jest opcjonalne i udzielane w ustawieniach systemu z konfiguratora; nie tworzymy niewidocznych nakładek. Sam foreground service nie znosi ograniczeń uruchamiania Activity z tła. Xiaomi/HyperOS może wymagać dodatkowych ustawień uruchamiania w tle/oszczędzania baterii. Nie omijamy blokady ekranu.

Po POWER_DISCONNECTED emitowany jest event i wykonywane `finishAndRemoveTask()`. Android pokazuje poprzednie zadanie lub launcher; aplikacja nie może zagwarantować powrotu do konkretnej aplikacji. Event przed zamknięciem jest best-effort: strona może nie zdążyć go obsłużyć. Monitor zostaje aktywny do następnego podłączenia. Start aplikacji na odłączonym tablecie nadal pozwala ją skonfigurować.

## Weryfikacja urządzenia

### Spotify / bridge v3

Instrukcja konta i testu: [Music / Spotify](../../docs/music-spotify.md). Nowe metody: `music.connect({clientId, authorize})`, `music.disconnect`, `music.getState`, `music.command({action,...})`, `music.getQueue`, `audio.getOutputs`, `audio.selectOutput({id})`, `audio.openSystemOutputPicker`. Zdarzenie `musicStateChanged` przekazuje ten sam model co odczyt stanu. Stare metody pozostają zgodne wstecz.

`connect` zwraca stan po rozpoczęciu próby, nie potwierdzenie autoryzacji. Wynik przychodzi eventem; limit oczekiwania to 60 s. Komendy playbacku odpowiadają dopiero po wyniku SDK. Opuszczenie widoku i rozłączenie App Remote nie pauzują Spotify. Nie żądamy Audio Focus ani dostępu do mikrofonu. Kolejka i wybór wyjścia zwracają `supported:false`; fallback otwiera ustawienia Bluetooth, nie udaje wyboru trasy Spotify.

`scripts/music-smoke.mjs` sprawdza fizyczny WebView przez przekierowany port CDP 9222: bridge, walidację Client ID, jasność Music, nawigację Home/reentry i diagnostykę audio. Nie autoryzuje konta ani nie uruchamia odtwarzania.

`gradlew connectedDebugAndroidTest` sprawdza roundtrip Keystore/DataStore i brak plaintext sekretu na dysku, używając osobnego kontekstu APK testowego. Testy jednostkowe obejmują normalizację originu, obce hosty/porty/schematy, URL z sekretami i transport klucza.

Na tablecie: przetestuj wszystkie przyciski strony, persist konfiguracji po ponownym uruchomieniu, błędny URL, obcy origin i iframe, błąd TLS oraz gest konfiguratora. Otwórz inną aplikację, podłącz zasilanie z/bez uprawnienia overlay, odłącz zasilanie i sprawdź powrót. Fizyczny test odłączenia wykonuj przez ADB Wi-Fi. `adb shell dumpsys battery unplug` / `reset` to wyłącznie symulacja (zawsze zakończ `reset`), nie zastępuje fizycznego testu kabla. Nie wysyłaj spreparowanych protected broadcastów przez `am broadcast`.

Dokumentacja platformy: https://developer.android.com/reference/androidx/webkit/WebViewCompat ; https://developer.android.com/guide/components/activities/background-starts ; https://developer.android.com/develop/background-work/services/fgs/service-types

Spotify: błąd połączenia zachowuje kategorię wyjątku SDK w polu error. Nazwa jest ograniczona do znaków alfanumerycznych/podkreślenia i 80 znaków; wiadomość wyjątku nie opuszcza APK. Frontend pokazuje odpowiednią instrukcję naprawy.

### Android 14+ — okno autoryzacji

App Remote 0.8.0 wiąże usługę Spotify przez applicationContext bez BIND_ALLOW_ACTIVITY_STARTS. Na Androidzie 16 powodowało to BAL_BLOCK przy otwieraniu AuthorizationActivityInternalProxy i timeout po 60 s. SpotifyBindingContext dodaje publiczną flagę Androida tylko dla authorize=true, pakietu com.spotify.music i dwóch znanych akcji App Remote na API 34+. Nie obniżamy target SDK ani nie uruchamiamy prywatnej Activity Spotify. System nadal wymaga widoczności aplikacji i zgody użytkownika.

Device Owner preparation: WallDeckAdminReceiver and res/xml/device_admin.xml provide a provisioning entry point only, without automatic policies or kiosk activation. On the current tablet, ADB provisioning was rejected because existing accounts are present. No accounts were removed. Full kiosk and safe exit controls remain pending.

Provisioning update: after the user removed all accounts, Device Owner registration succeeded without a factory reset. WallDeck is now the device owner on the test tablet. Kiosk remains inactive pending implementation of entry and safe exits.

Managed dock kiosk: when Device Owner, dock monitoring is enabled and power is connected, WallDeck uses LOCKED mode with system features disabled. Native bottom-right Tryb tabletu exits; manual relaunch or a new power connection re-enters. Unplug stops kiosk before finishing. Emergency: hold Volume Down for 2 seconds; also seven taps upper-left opens native configuration with exit button. No automatic kiosk on battery. Spotify is allowlisted for authorization screens.

Deployment verified: final emergency-exit update installed successfully. On the physical tablet, an injected 2.5-second Volume Down hold changed LOCKED to NONE and returned to the launcher.

Kiosk hardening: WallDeck declares non-resizable/no picture-in-picture. Managed kiosk temporarily applies DISALLOW_CREATE_WINDOWS; native exit and DeviceAdminReceiver lock-task-exit callback clear this restriction.

HyperOS limitation: its top-edge window toolbar remains visible and X can close the task even in managed kiosk. PowerService now attempts to reopen a removed WallDeck task after 700 ms while powered and Device Owner. Explicit native exits set a persistent suppression flag; no automatic reopen after those exits. This mitigates closure, not toolbar visibility.

Further diagnosis: HyperOS X hides the existing task while LOCKED remains active, so task-removed callbacks do not fire. On Android 12L+, onStop now checks the current task visibility after 1 second and restores it if still docked/locked, awake/unlocked, not deliberately exiting and Spotify is not connecting. Exact X reproduction awaits confirmation.

Touch activity is emitted at release after excluding the native downward swipe, so assistant inactivity handling cannot consume the menu gesture before it completes.

The large always-visible tablet-mode button was removed. Exit is now the small tablet icon in the web menu. Native configuration exit and 2-second Volume Down emergency exit remain available without the web page.
