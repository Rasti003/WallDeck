# WallDeck Android 0.1

Cienka aplikacja Android: Kotlin 2.1, AndroidX WebKit, coroutines, DataStore i Android Keystore. Android 9+, compile/target SDK 35, AGP 8.9.2, Gradle 8.11.1, JDK 17–23. Adapter Spotify App Remote kontroluje aplikację Spotify. Wake word i YouTube pozostają kontraktami rozszerzeń; HA obsługuje panel WWW.

## Uruchomienie

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

`../web-panel/wallpanel.js` udostępnia `await WallPanel.call(method, args)`. Transport: `WallPanelNative.postMessage(JSON.stringify({id: '1', method: 'battery', args: {}}))`; odpowiedź przez `onmessage`: `{id,result}` lub `{id,error}`. Wersja protokołu: 3 (zgodna wstecz z v2). Metody `deviceInfo` i `sensors` zwracają rozmiar ekranu oraz katalog sensorów Androida; dla sensora światła `value` zawiera luks, jeśli firmware pozwala aplikacji odebrać pomiar. `cameraLightSampling` włącza krótkie, okresowe pomiary luminancji przednią kamerą i wymaga uprawnienia `CAMERA`; wyłączenie zamyka aktywną sesję. Eventy: `wallpanel:powerConnected`, `wallpanel:powerDisconnected`, `wallpanel:batteryChanged`, `wallpanel:ambientLightChanged`, `wallpanel:cameraLightChanged` i `wallpanel:userInteraction`, dane w `event.detail`. Eventy światła przekazują odpowiednio `{lux}` i `{brightnessPercent}`. `userInteraction` jest emitowane przy rozpoczęciu dotyku całego WebView, również wewnątrz cross-origin iframe, aby manager widoków mógł zerować licznik bezczynności. Zarejestruj odbiornik i wywołaj pierwszą metodę, aby rozpocząć odbiór eventów. Po przeładowaniu dokument tworzy nową sesję bridge.

Metody: capabilities, deviceInfo, battery, appVersion, permissions, brightness (`value`: -1 = systemowa, 0..1), mediaVolume (`value`: 0..1), keepAwake (`enabled`: boolean), haptics, reload, signChallenge. Pominięcie argumentów w brightness/mediaVolume/keepAwake odczytuje aktualną wartość. Jasność i keep-awake dotyczą tylko okna aplikacji; głośność dotyczy systemowego strumienia multimediów.

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
