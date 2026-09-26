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

Frontend ma rejestr niezależnych widoków. Serwer przechowuje identyfikator aktywnego widoku, udostępnia `POST /api/views/activate` i rozsyła zmianę do paneli przez WebSocket. Manager widoków mapuje zdarzenia na akcje i przechowuje reguły w ustawieniach. Domyślna sekwencja to `tap/swipeDown photos → ha → 30 s bezczynności → assistant-expressive idle → 10 s → photos`. Stan przejścia należy do routera, a nie komponentu twarzy. Dotyk podczas pośredniego `idle` czyści timer i wraca do źródłowego HA; event aktywnej mimiki zatrzymuje automatyczny powrót, pozostawiając asystenta na ekranie. APK rozpoznaje przesunięcie zaczęte w górnych 40% WebView i przekazuje je jako `wallpanel:swipeDown`; zwykła przeglądarka ma odpowiednik pointer events. Aktywność zwykłej strony jest wykrywana przez zdarzenia przeglądarki; dotyk wewnątrz cross-origin iframe HA przekazuje APK jako `wallpanel:userInteraction`. Pierwszy widok `photos` wybiera układ na podstawie orientacji ekranu: poziomy ekran pokazuje jedno zdjęcie poziome albo dwa pionowe, a pionowy ekran stosuje regułę odwrotną. `/admin` ma nawigację sekcyjną i konfiguruje źródło, cel, czasy i opcjonalny etap asystenta bez umieszczania odnośnika na ekranie tabletu.

Konfiguracja każdego widoku zawiera docelową jasność okna. Po zmianie aktywnego widoku frontend wywołuje metodę `brightness` Android Bridge; pozwala to przyciemniać przyszłe widoki nocne bez zmiany globalnej jasności systemu.

APK udostępnia przez bridge v2 metadane urządzenia, baterię, status uprawnień i katalog z `SensorManager`. Klient panelu przesyła raport po otwarciu WebSocket, po zmianie baterii i co 15 sekund. Serwer przechowuje ostatni raport wyłącznie w pamięci, uznaje urządzenie za online przez 45 sekund i rozsyła `device.updated`. `/api/devices` oraz sekcja Urządzenie w `/admin` pokazują ten sam stan. Odczyt sensora światła jest opcjonalny: niektóre firmware udostępniają wpis sensora aplikacji, ale rezerwują strumień pomiarów dla usług systemowych.

Reguła nocy ma jawnie wybierane źródło: liczbową encję Home Assistant, natywny sensor Androida albo eksperymentalny sampler przedniej kamery. Domyślnie panel odpytuje wybraną encję HA co 10 sekund przez serwerowe API, więc token HA nie trafia do przeglądarki ani APK. Stany nieliczbowe są pomijane. Manager widoków stosuje dla każdego źródła konfigurowaną histerezę: niski próg otwiera `assistant-expressive` w `idle`, po skonfigurowanym czasie 0,3–10 sekund przechodzi animacją twarzy do `sleep`, a wysoki próg ponownie uzbraja regułę. Domyślny czas `sleepEntryDelaySeconds` wynosi 1,6 s. Sekwencja jest realizowana w komponencie widoku i sprząta timer przy zmianie żądania albo demontażu. Dotknięcie w stanie `sleep` prowadzi bezpośrednio do HA; flaga ciemnej fazy pozostaje aktywna, więc kolejny niski odczyt nie przerywa obsługi HA. Wzrost ponad próg resetuje flagę i zamyka Sen do albumu tylko wtedy, gdy nadal jest on aktywnym widokiem.

Opcjonalny `CameraLightSampler` jest fallbackiem dla firmware blokującego `Sensor.TYPE_LIGHT`. Co 10–300 sekund otwiera przednią kamerę, pomija dwie klatki rozgrzewkowe, próbkuje luminancję trzeciej klatki i emituje procent jasności. Sesja kamery jest zamykana po każdym pomiarze, przy wyłączeniu opcji, przejściu aplikacji w tło i zniszczeniu Activity. Frontend stosuje do procentu osobną parę progów z tą samą semantyką ciemnej fazy.

WallDeck Server jest jedynym klientem Home Assistant. Konfigurację podaje się w `/admin`; token Long-Lived Access Token jest szyfrowany AES-256-GCM, a klucz znajduje się w osobnym pliku danych runtime. Publiczne API zwraca tylko stan `configured` i diagnostykę, nigdy token. Adapter pobiera początkowy snapshot encji, subskrybuje `state_changed` przez WebSocket i automatycznie ponawia połączenie. Dowolne encje można dodać do overlayu, opisać własną etykietą i rozmieścić w sześciu strefach ekranu. Widok `ha` osadza skonfigurowany dashboard. Na obecnej instancji HA osadzanie jest włączone przez `http.use_x_frame_options: false`; po zmianie konfiguracja została zweryfikowana, HA uruchomiony ponownie, a `/ha` sprawdzony z ekranem logowania dashboardu.

## Prototyp twarzy asystenta

Identyfikatory mimiki i schemat `assistantBrightness` są współdzielone w contracts. Ustawienia zawierają `globalEnabled` i opcjonalne overrides 0.05–1 dla każdej miny (null/brak = dziedziczenie). Globalny poziom pozostaje w `viewBrightness[assistant-expressive]` dla zgodności wcześniejszych ustawień. Stare konfiguracje dostają domyślny sleep=0.05. `PanelContext` przekazuje ustawienia i docelowy widok; asystent steruje jasnością tylko podczas aktywnego wyświetlania. Wychodząca animacja nie nadpisuje jasności kolejnego widoku. Wyłączenie poziomu wspólnego przy braku override wysyła brightness=-1, oddając jasność Androidowi. Query `state` podglądu jest walidowane wspólnym enumem i nie aktywuje widoku na innych urządzeniach.

Spokojny renderer usunięto. Jedyny widok to `assistant-expressive`; stary adres `/assistant-demo` przekierowuje do niego, a schemat kontraktu migruje stare identyfikatory w zapisanych regułach i żądaniach API. Nowy zapis ustawień usuwa nieużywane pole jasności spokojnej wersji. Historyczne wyniki testów pozostają w raporcie.


Router renderuje kluczowane widoki w Motion AnimatePresence (mode wait). Wychodzący ekspresyjny asystent rozpoznaje fazę exit przez useIsPresent i przechodzi wizualnie w sleep; router wygasza go przed montażem następnego ekranu. Stan docelowy pozostaje kontrolowany przez istniejące API i reguły. Szybkie komendy zastępują oczekujący widok najnowszym wyborem.

Na trasie `/panel` pośredni asystent pokazuje wyłącznie twarz w stanie `idle`; kontrolki developerskie są dostępne tylko w studiu `/assistant-expressive`. Jasność w sekwencji jest wyliczana przez istniejące mechanizmy per widok i mimika, więc przejście przywraca kolejno poziomy HA, asystenta idle i galerii.


Wspólny transport `connectEvents` wznawia połączenie WebSocket po restarcie serwera lub rozłączeniu, stosując ograniczony exponential backoff z jitterem. Nowy socket odbiera snapshot widoku i HA; panel i album odświeżają ustawienia przez REST. Demontaż komponentu zamyka socket i usuwa zaplanowane ponowne połączenie. Admin pokazuje błąd nieudanej komendy aktywacji.

Serwowanie frontendu: `registerClient` rozwiązuje pliki dynamicznie, również po przebudowie Vite w działającym serwerze. HTML ma `Cache-Control: no-cache`; fallback HTML obejmuje tylko znane trasy SPA. Nieznane API i brakujące assety zwracają 404, aby przeglądarka nie otrzymała HTML zamiast modułu JavaScript.

Specyfikacja: [Notion, sekcja 15](https://www.notion.so/3e7827a850e3816ab406dabf341c372a). Widok `assistant-expressive` dołącza do wspólnego rejestru widoków, walidacji API, reguł i jasności per widok. Trasa `/assistant-demo` wymusza lokalny podgląd; aktywacja przez API pokazuje go na zwykłym `/panel`.

Podział odpowiedzialności: `assistant-state.ts` zawiera jawną maszynę stanów i mapowanie audio, `ExpressiveAssistantFace` renderuje osobne oczy, brwi, nos, usta i akcenty przez SVG + Motion, a `AssistantDemoView` dostarcza kontrolki oraz testowy poziom audio. To samodzielny prototyp bez powiązania z voice pipeline. Timer losowych mikroanimacji i timer audio są zwalniane przy odmontowaniu; nie powstaje historia próbek audio. Tryb sleep obniża intensywność grafiki, natomiast jasność okna pochodzi ze wspólnego mechanizmu per widok.

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

Interfejsy `WakeWordModule`, `MediaModule` i `HomeAutomationModule` oddzielają rdzeń APK od przyszłych silników. Docelowy wake word ma działać lokalnie, a STT/LLM/TTS na homelabie. Spotify używa adaptera App Remote opisanego poniżej; HA obsługuje web/backend. YouTube pozostaje przyszłym modułem.

## Music / Spotify — bridge v3

`MusicView → MusicController → Android Bridge → SpotifyController → Spotify App Remote → Spotify Android → systemowe audio`. React renderuje dane i animacje; adapter Kotlin utrzymuje połączenie i subskrypcje poza cyklem życia komponentu. Nawigacja nie wysyła pause/disconnect. Activity zwalnia App Remote podczas zniszczenia, pozostawiając player Spotify niezależny.

Wspólny kontrakt znajduje się w `packages/contracts/src/music.ts`. Stan obejmuje connection, błąd, aktualny utwór, artwork, pozycję i czas pomiaru, prędkość, shuffle/repeat oraz ograniczenia playera. Web interpoluje postęp tylko podczas potwierdzonego odtwarzania. Opóźnione wyniki poprzedniej generacji połączenia są odrzucane. Artwork pozostaje w pamięci, nie trafia do storage zdjęć ani serwera.

Odczyt rzeczywistej kolejki wymaga dodatkowej integracji, ponieważ App Remote ma tylko operację dodawania do kolejki. Diagnostyka Androida pokazuje dostępne wyjścia, nie deklaruje aktywnej trasy innej aplikacji. Fallback otwiera ustawienia Bluetooth. Sterowanie audio focus i rozróżnianie pauzy użytkownika od przerwania przez asystenta pozostają osobnym etapem; obecny adapter nie przejmuje fokusu ani mikrofonu.

Kontrakt domenowy może zostać użyty przez przyszły MCP/automatyzacje; transport z serwera do konkretnego urządzenia i jego autoryzacja nie są jeszcze wdrożone. Client ID jest obecnie wspólnym ustawieniem aplikacji, a każda instalacja tabletu autoryzuje lokalne Spotify.

### Aktywność klientów

Obecny prototyp ma wspólny aktywny widok dla podłączonych paneli. Komunikat WebSocket `panel.activity` synchronizuje reset licznika bezczynności, aby dodatkowa karta panelu nie przełączała aktywnie używanego tabletu. Reguły dotyku i bezczynności są wyłączone w wymuszonym podglądzie `/ha`. Docelowe profile wielu urządzeń powinny rozdzielać widoki i aktywność per Device ID.

Android Activity działa w immersive fullscreen i ukrywa paski systemowe. Android zachowuje systemową kontrolę nad gestem rozpoczętym dokładnie na krawędzi; HyperOS może wtedy przejściowo pokazać status bar. Trwałe wyłączenie panelu powiadomień będzie wymagało zarządzanego trybu Device Owner/lock task.

Diagnostyka Spotify: pole error w istniejącym kontrakcie stanu przechowuje kategorię wyjątku SDK, nie jego wiadomość. Music tłumaczy kategorię na instrukcję naprawy konfiguracji.

SpotifyBindingContext dopasowuje bindService SDK 0.8.0 do Androida 14+: przekazuje BIND_ALLOW_ACTIVITY_STARTS jedynie podczas jawnie żądanej autoryzacji i wyłącznie do znanej usługi Spotify. Wrapper applicationContext jest używany także przy unbind, bez utrzymywania referencji do Activity. Kontrakt web/bridge v3 nie zmienia się.

Manager widoków utrzymuje obserwację MusicState niezależnie od montowania MusicView. Na końcu timera HA rozstrzyga docelowy przepływ na podstawie pochodzenia Music i aktualnego playbacku. Przejście dancing jest zarządzane przez manager, nie przez 8-sekundowy timer demo twarzy. Dotyk usuwa timer i używa natychmiastowego przejścia Motion. Nie zmieniono kontraktu bridge ani APK. Źródłem stanu pozostaje lokalne Spotify; podgląd w zwykłej przeglądarce nie zakłada odtwarzania.

### Playback-triggered Music view
The global App Remote observer detects the transition to connected + track + !paused independently of the current view, then invokes dance -> Music. Music and forced previews are not interrupted. Disconnects retain the last known edge state; stale polls cannot overwrite newer player events. This does not start or transfer playback. Observation is limited to local App Remote telemetry.

The global player observer reconnects disconnected, installed Spotify with configured Client ID and authorize=false. Retry spacing is 60 seconds; connection errors do not prompt automatically.

Music inactivity uses a 30-second rule independent of the HA inactivity source. Playback boolean changes restart/cancel the timer; repeated player snapshots do not reset it. The idle transition records Music as its interaction return target and always completes in photos.

Admin StateMachinesAdmin presents the current transition catalogue with settings-derived timers and thresholds. Assistant states, delays and timeout destinations are read from the existing reducer. The catalogue is read-only and does not change runtime routing.

Device Owner provisioning entry point added to the native app. It does not automatically start lock task or apply policies. Existing dock behavior remains active. Full kiosk lifecycle is pending successful provisioning and native exit controls.

Native MainActivity controls managed kiosk lifecycle from dock configuration and physical power. No bridge/API changes. Native exit control is independent of WebView and HA. PowerService may launch through Device Owner privileges or overlay permission. Stopping the Activity leaves power monitoring active; it relaunches on a new power-connected event, not battery level updates.
