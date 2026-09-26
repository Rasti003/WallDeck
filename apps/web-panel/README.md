# WallDeck Web

Aplikacja WWW panelu ściennego. Pierwszy widok prezentuje lokalną kopię albumu zdjęć i automatycznie dopasowuje układ do orientacji ekranu oraz fotografii.

## Dostępne ekrany

- `/music` — podgląd Music; aktywacja `music` w managerze wyświetla go na `/panel`. Sterowanie wymaga APK z bridge v3.

- `/panel` — pełnoekranowy widok dla aplikacji tabletowej;
- `/admin` — osobny panel ustawień otwierany z telefonu lub komputera. WallPanel nie pokazuje prowadzącego do niego odnośnika.

Na ekranie poziomym aplikacja losowo pokazuje jedno zdjęcie poziome albo parę zdjęć pionowych. Na ekranie pionowym reguła działa odwrotnie. Następny zestaw jest ładowany z wyprzedzeniem, a ostatnio pokazane zdjęcia są pomijane, gdy istnieją inne pasujące fotografie.

Panel administratora ma stałą nawigację z osobnymi sekcjami: pulpit, widoki i reguły, album zdjęć, Home Assistant, Asystent i Urządzenie. Pozwala ustawić czas zmiany i przejścia, położenie overlayu, zegar, datę i pogodę. Sekcja Home Assistant udostępnia wyszukiwarkę wszystkich encji oraz edytor elementów overlayu: własna etykieta i jedna z sześciu stref ekranu. Sekcja Urządzenie pokazuje model, wersję Androida i aplikacji, ekran, baterię, zasilanie, uprawnienia oraz pełny katalog sensorów zgłoszony przez tablet. Ustawienia, stany i raport urządzenia są wysyłane do działającego panelu przez WebSocket bez przeładowania strony.

Każdy widok ma własne ustawienie jasności. Po aktywacji widoku klient wysyła jego poziom do Android Bridge, więc przyszłe ekrany nocne mogą automatycznie przyciemniać tablet, a dzienne przywracać wyższą jasność.

## Uruchomienie

### Music / Spotify

Sekcja **Music · Spotify** w `/admin` zapisuje publiczny Client ID oraz jasność widoku Music. Autoryzacja odbywa się przyciskiem na tablecie. Widok ma artwork, metadane, kontekst, interpolowany postęp, kontrolki playbacku i panel diagnostyki audio. Przyciski uwzględniają ograniczenia zwracane przez konto Spotify. Zmiana widoku nie zatrzymuje odtwarzania. Tap całego ekranu i gest w dół nie wywołują nawigacji z Music; służy do tego Home.

`MusicController` jest oddzielony od Reacta i używa zaufanego bridge. Nie ma jeszcze zdalnego transportu MCP/server→tablet. Up Next i playlisty pokazują jawny stan niedostępności. Szczegóły konfiguracji i pozostałe testy: [Music / Spotify](../../docs/music-spotify.md).

Panel, admin, album i widok HA automatycznie wznawiają WebSocket po rozłączeniu (od 1 do 15 sekund między próbami, z niewielką losową zwłoką). Snapshot przywraca aktualny widok i stan HA; panel oraz album ponownie pobierają ustawienia. Po wdrożeniu tej poprawki starsze, już otwarte karty trzeba jednorazowo odświeżyć.

Serwer rozpoznaje pliki frontendu przy każdym żądaniu, dzięki czemu nowe nazwy assetów po buildzie nie wymagają restartu backendu. HTML wymaga rewalidacji cache. Brakujący plik JS/CSS zwraca 404, a fallback SPA dotyczy wyłącznie tras ekranów. Test `apps/server/test/client.test.mjs` odtwarza publikację assetu po uruchomieniu serwera.

Wymagane są Node.js 22+ i pnpm 11.

```powershell
./run.ps1 -PhotoStoragePath 'G:\zedjecia'
```

Skrypt instaluje zależności, buduje klienta i serwer, a następnie uruchamia aplikację na porcie `8080`. Inny port można podać przez `-Port`. Po wcześniejszym zbudowaniu aplikacji opcja `-SkipBuild` skraca kolejne uruchomienia.

Adresy w sieci lokalnej:

```text
http://ADRES-SERWERA:8080/panel
http://ADRES-SERWERA:8080/admin
```

Podczas testów przez ADB można użyć:

```powershell
adb reverse tcp:8080 tcp:8080
```

i ustawić w APK adres `http://127.0.0.1:8080/panel`.

## Wywołanie widoku

### Asystent demo

Sekcja **Asystent** w bocznym menu `/admin` zawiera wszystkie 14 min i konfigurację jasności okna tabletu. Priorytet: własna jasność miny → wspólny poziom asystenta → Android (gdy wspólny poziom wyłączony). Własne ustawienia działają także przy wyłączonej jasności wspólnej. Domyślnie tylko sleep ma własne 5%, pozostałe dziedziczą dotychczasową jasność widoku. Wyłączenie „Własnej jasności” przywraca dziedziczenie. Zapis działa natychmiast przez WebSocket; zmiana miny i wyjście do innego widoku ustawiają odpowiedni poziom. Podgląd otwiera wybraną minę w przeglądarce, która nie zmienia jasności monitora.

W tej samej sekcji reguła **Sen po zmroku** może używać dowolnej liczbowej encji Home Assistant. Administrator wyszukuje encję, widzi jej bieżący stan i ustawia osobny próg wejścia w `sleep` oraz wyższy próg ponownego uzbrojenia. Panel odczytuje stan co 10 sekund; `unknown`, `unavailable` i pozostałe wartości nieliczbowe są pomijane. Histereza zapobiega przełączaniu przy granicznej wartości. Automatyczne wejście w noc pokazuje najpierw spokojne `idle`, a następnie płynnie zamyka oczy i przechodzi do `sleep`. Czas spokojnej twarzy można ustawić w tym samym formularzu w zakresie 0,3–10 sekund; domyślnie wynosi 1,6 s. Pojedyncze dotknięcie śpiącej twarzy zawsze otwiera HA i nie usypia go ponownie w tej samej ciemnej fazie. Natywny sensor tabletu i przednia kamera pozostają alternatywnymi źródłami wybieranymi jawnie; domyślnym źródłem jest HA, a kamera pozostaje wyłączona.

Na urządzeniach blokujących publiczny sensor można włączyć **Używaj przedniej kamery jako czujnika**. APK otwiera kamerę na trzy małe klatki, oblicza średnią jasność kanału luminancji i natychmiast ją zamyka. Domyślne progi to 5%/15%, a pomiar odbywa się co 30 sekund. W adminie można osobno wyłączyć kamerę, zmienić oba progi i częstotliwość 10–300 sekund.

Ekspresyjna wersja oferuje dodatkowo: ciekawość, niepewność („Powtórz?”), potwierdzenie skinieniem, zaskoczenie, oczko i śmiech. Śmiech jest animacją bez dźwięku: rytmiczne usta, przymrużone oczy i drobne podskoki; po 3,2 s wraca do idle. Krótkie potwierdzenie, zaskoczenie i oczko również wracają automatycznie. W reduced motion pozostaje statyczna ekspresja.

Ekspresyjny asystent ma wejście (około 0,9 s: pojawienie, uniesienie, otwarcie oczu) i wyjście (około 0,85 s: przymknięcie oczu i wygaszenie). Router utrzymuje wychodzący ekran do zakończenia animacji i dopiero wtedy montuje ostatnio wybrany widok. Systemowe reduced motion wyłącza przejścia routera i animację wejścia.

Jedyny wariant asystenta to `/assistant-expressive` z rendererem `ExpressiveAssistantFace.tsx`. Spokojna wersja została usunięta. Stary adres `/assistant-demo` przekierowuje do obecnego demo, a starsze identyfikatory widoków w regułach i API są migrowane do `assistant-expressive`.

Widok `assistant-expressive` jest dostępny w `/admin` → Widoki i reguły, przez API aktywacji oraz jako niezależne studio `/assistant-expressive`. Osobna trasa wymusza podgląd i nie podlega regułom przełączania; widok wywołany na `/panel` respektuje normalne reguły, w tym powrót po bezczynności. Ma własną jasność ustawianą w adminie.

Twarz w SVG + Motion zajmuje czarny ekran, ma jeden zmienny kolor akcentu i osiem stanów: idle, attention, listening, thinking, speaking, success, error, sleep. Sterowanie można schować. Studio oferuje suwak audio, symulację mowy i ograniczenie ruchu; respektuje też systemowe `prefers-reduced-motion`. Ustawienia mimiki w demo są lokalne i resetują się po ponownym otwarciu widoku.

`ExpressiveAssistantFace` przyjmuje `state`, `audioLevel` (0–1), `accentColor` oraz opcjonalne `reducedMotion`. Jawna maszyna przejść w `assistant-state.ts` jest niezależna od SVG: attention po 750 ms przechodzi do listening, success po 2200 ms do idle. Usta płynnie interpolują pięć zakresów otwarcia z wygładzonym audio. Zmiana stanu i demontaż sprzątają timery. Nie ma dostępu do mikrofonu, nagrywania, STT/LLM/TTS ani zewnętrznych assetów twarzy.

Backend udostępnia niezależny od UI punkt sterowania:

```http
POST /api/views/activate
Content-Type: application/json

{ "viewId": "photos" }
```

Każdy podłączony panel dostaje zmianę przez WebSocket. Z poziomu klienta dostępny jest także kontrakt `window.WallDeckViews.activate("photos")`. Rejestr widoków pozwala dodawać kolejne ekrany bez przebudowy logiki aktywacji.

Manager widoków w `/admin` przechowuje reguły zdarzenie → akcja. Domyślne reguły otwierają Home Assistant po pojedynczym dotknięciu albumu lub własnym przesunięciu w dół. Po 30 sekundach bezczynności w HA panel pokazuje ekspresyjnego asystenta w spokojnym `idle`, a po kolejnych 10 sekundach przechodzi do albumu. Dotknięcie podczas `idle` anuluje powrót i natychmiast otwiera HA; aktywna mimika asystenta również zatrzymuje timer galerii. Widok źródłowy, docelowy, oba czasy i użycie pośredniego asystenta można zmienić w panelu administratora. Zwykła przeglądarka wykrywa gest i aktywność dokumentu, a APK dodatkowo emituje `wallpanel:swipeDown` i `wallpanel:userInteraction`, dlatego gest działa także na tablecie, a dotknięcia osadzonego dashboardu HA zerują licznik.

Po uruchomieniu wewnątrz APK klient wykrywa zaufany Android Bridge i włącza `keepAwake` na czas wyświetlania panelu. W zwykłej przeglądarce ten sam frontend działa bez bridge'a.

## Home Assistant

Wyszukiwarka w `/admin` pozwala dodać do albumu dowolną encję Home Assistant, ustawić jej etykietę i jedną z sześciu pozycji. Identyfikatory elementów overlayu są generowane również w przeglądarkach bez `crypto.randomUUID`, co obejmuje panel otwierany przez lokalny adres HTTP. Zapisana encja jest aktualizowana przez WebSocket bez przeładowania albumu.

## Pogoda

Po wpisaniu współrzędnych w `/admin` serwer pobiera bieżącą pogodę z Open-Meteo i przechowuje wynik przez 10 minut. Klient nie łączy się bezpośrednio z zewnętrzną usługą.

## Synchronizacja Google Photos

Synchronizator odczytuje album udostępniony przez link, pobiera nowe zdjęcia do lokalnego magazynu i zapisuje manifest `.walldeck-album.json`. Link albumu jest kluczem dostępu — trzymaj go w lokalnym pliku konfiguracyjnym i nie dodawaj do repozytorium.

```powershell
Copy-Item photo-sync.config.example.json photo-sync.config.json
# Uzupełnij albumUrl i storagePath.
node tools/sync-google-photos.mjs --config photo-sync.config.json
```

Kolejne uruchomienia pomijają istniejące pliki. Element usunięty z albumu zostaje oznaczony jako nieaktywny, ale lokalny plik nie jest automatycznie kasowany. Mechanizm wykorzystuje nieudokumentowany format strony udostępnionego albumu, dlatego parser jest izolowany w adapterze.

Wyniki pierwszej synchronizacji znajdują się w [raporcie testu](PHOTO_SYNC_TEST_REPORT.md).

Music rozróżnia błędy autoryzacji, logowania, offline i timeout według bezpiecznej kategorii przekazanej przez bridge. Nie wyświetla surowych odpowiedzi Spotify.

Dance (dancing): an eight-second smile, head sway and alternating raised hands, then idle. Available in the studio and per-expression brightness settings. Reduced motion disables rhythmic movement. No audio playback.

### Powrót z HA podczas muzyki

Po wejściu Music → HA manager sprawdza playback również poza ekranem Music (eventy bridge i odczyt co 5 s). Gdy przy końcu bezczynności Spotify jest connected, ma utwór i paused=false, następuje HA → dancing → Music. Czas tańca korzysta z assistantIdleSeconds, opisanego w adminie jako czas idle/tańca. Dotyk/aktywność podczas tańca pomija animację wyjścia i wejścia, otwierając Music natychmiast. Pauza/utrata połączenia podczas tańca przywraca docelowy widok zwykłej reguły po końcu przejścia. Wejście do HA z galerii zachowuje zwykły powrót. Historia wejścia jest lokalna dla bieżącej sesji panelu; reload w HA ją zeruje. Reguła nocy może przerwać taniec. Animacja nie analizuje ani nie synchronizuje się z dźwiękiem Spotify.

### Automatic Music activation
A connected Spotify playback start opens the dancing assistant, then Music. Tap skips the dance. Repeated snapshots, track changes and reconnects do not reopen the view. Initial already-playing state also activates Music. Dance duration uses the assistant idle / dance setting. Requires an active App Remote connection. Playback on another device is detected only if the tablet Spotify reports it; account-wide Web API monitoring is not implemented.

Spotify App Remote reconnects silently on panel startup and when disconnected (at most once a minute). Authorization errors require the explicit Connect button.
