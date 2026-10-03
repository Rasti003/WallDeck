# WallDeck Web

Aplikacja WWW panelu ściennego. Pierwszy widok prezentuje lokalną kopię albumu zdjęć i automatycznie dopasowuje układ do orientacji ekranu oraz fotografii.

Rozmowa głosowa ma dwa zachowywane niezależnie tryby wybierane w adminie: bezpośredni **GPT-Live** oraz **Luna** (`transkrypcja → model tekstowy/MCP → TTS`). Oba zaczynają się lokalnym wake wordem. Luna używa `speaker-service` do wyznaczania końca wypowiedzi aktywnego mówcy; GPT-Live używa go równolegle do diagnostyki. Silero VAD odrzuca ciszę, a ECAPA-TDNN porównuje kolejne fragmenty z pierwszym głosem sesji. Audio nie jest zapisywane, `pyannote.audio` nie należy do domyślnego obrazu. Szczegóły: [apps/speaker-service/README.md](apps/speaker-service/README.md).

Historia administratora zapisuje pełny tekstowy przebieg sesji GPT-Live: wypowiedzi obu stron z czasem, przerwania, delegacje Responses, argumenty i wyniki narzędzi, model, zużycie oraz przyczynę zamknięcia. Obserwacje ECAPA otrzymują anonimowy fingerprint próbki, relację do kotwicy i wynik podobieństwa. Surowe audio ani embeddingi nie są zapisywane; fingerprint pozostaje diagnostyczny i przygotowuje model danych pod przyszłe, osobno rejestrowane profile użytkowników.

Odpowiedzi trybu Luna mogą być syntezowane przez OpenAI TTS albo ElevenLabs. Klucz ElevenLabs jest wpisywany w adminie, szyfrowany w runtime i nigdy nie wraca do klienta. Admin pobiera bezpieczną listę nazw/ID głosów dostępnych dla konta. ElevenLabs zwraca do tabletu surowy PCM 24 kHz, więc korzysta z tej samej natywnej ścieżki głośnika co pozostałe odpowiedzi asystenta.

## Dostępne ekrany

- `/music` — Music z odtwarzaniem przez APK oraz wyszukiwaniem, playlistami i kolejką przez Spotify Web API (PKCE).

- `/panel` — pełnoekranowy widok dla aplikacji tabletowej;
- `/admin` — osobny panel ustawień otwierany z telefonu lub komputera. WallPanel nie pokazuje prowadzącego do niego odnośnika.

Na ekranie poziomym aplikacja losowo pokazuje jedno zdjęcie poziome albo parę zdjęć pionowych. Na ekranie pionowym reguła działa odwrotnie. Następny zestaw jest ładowany z wyprzedzeniem, a ostatnio pokazane zdjęcia są pomijane, gdy istnieją inne pasujące fotografie.

Panel administratora ma nawigację pogrupowaną według zadań (szczegóły poniżej). Pozwala ustawić czas zmiany i przejścia, położenie overlayu, zegar, datę i pogodę. Sekcja Home Assistant udostępnia wyszukiwarkę wszystkich encji oraz edytor elementów overlayu: własna etykieta i jedna z sześciu stref ekranu. Sekcja Urządzenie pokazuje model, wersję Androida i aplikacji, ekran, baterię, zasilanie, uprawnienia oraz pełny katalog sensorów zgłoszony przez tablet. Dziennik systemowy rozdziela trwałą historię błędów od aktywności tabletu, pozwala je filtrować, przeszukiwać i niezależnie czyścić. Ustawienia, stany i raport urządzenia są wysyłane do działającego panelu przez WebSocket bez przeładowania strony.

Każdy widok ma własne ustawienie jasności. Po aktywacji widoku klient wysyła jego poziom do Android Bridge, więc przyszłe ekrany nocne mogą automatycznie przyciemniać tablet, a dzienne przywracać wyższą jasność.

Widok `/timers` („Zegar”) obsługuje wiele równoległych minutników, budziki jednorazowe i cykliczne oraz ciche zadania asystenta. Główny ekran pokazuje wyłącznie minutniki i budziki w niezależnie przewijanej kolumnie, dzięki czemu dowolna liczba pozycji mieści się na fizycznym ekranie Xiaomi 2048×1280 (około 1170×731 CSS px). Zadania asystenta mają osobny podwidok wewnątrz Zegara z własnymi przewijanymi listami planów i historii; na ekranie głównym pozostaje tylko karta z liczbą zaplanowanych zadań. Zaplanowane zadanie można edytować bez usuwania rekordu: formularz pozwala zmienić etykietę, instrukcję, tryb, datę, godzinę oraz dni powtarzania. Najbliższy aktywny minutnik automatycznie otwiera osobny ekran odliczania: cyfry i pierścień wypełniają niemal cały tablet, a świetlny punkt pokazuje dokładny postęp. Mały przycisk zmniejsza odliczanie do widoku zarządzania; po 12 sekundach bezczynności wraca ono na pełny ekran. Oba tryby pozostają zamontowane podczas crossfade’u, a zasłonięty widok zarządzania jest wyłączany dopiero po zakończeniu przejścia. Pełny ekran aktualizuje stan raz na sekundę, płynnie interpoluje ruch pierścienia i nie renderuje kosztownych animowanych rozmyć. Minutnik utworzony narzędziem asystenta natychmiast przypina Zegar na ekranie i pokazuje właśnie utworzone odliczanie aż do wybicia albo anulowania. Zegar wystawia routerowi flagę `stayOnThisView=true` tylko podczas aktywnego odliczania. Bez tej flagi — także przy zapisanych budzikach lub po zakończeniu minutnika — używa wspólnej reguły bezczynności: po 30 sekundach pokazuje animację `idle`, a po kolejnym skonfigurowanym czasie przechodzi do zdjęć. Dotyk, klawiatura lub natywne zdarzenie tabletu rozpoczyna pierwsze 30 sekund od nowa. Przy wyjściu zakończony minutnik jest automatycznie zamykany; dzwoniący budzik pozostaje na ekranie do ręcznego wyłączenia albo drzemki. Nowy budzik lub zadanie utworzone przez asystenta otwiera właściwy podwidok, przewija nową kartę na środek i trzykrotnie ją podświetla; po 4,5 s panel pokazuje skonfigurowaną animację `idle`, a następnie wraca do zdjęć. Jeżeli trwa przypięty minutnik, krótka prezentacja nowego wpisu kończy się powrotem do jego pełnoekranowego odliczania. Zadanie asystenta ma jednorazowy termin albo dni powtarzania i obowiązkową instrukcję; po terminie nie dzwoni ani nie przełącza widoku, tylko uruchamia aktualnie skonfigurowany zestaw narzędzi asystenta. Wynik lub błąd zostaje w krótkiej historii ekranu. Harmonogram jest zapisany atomowo w prywatnym runtime `schedules.json`, używa strefy `Europe/Warsaw`, a zmiany trafiają do klientów przez WebSocket. Ekran alarmu oferuje wyłączenie i dziesięciominutową drzemkę. Te same operacje są dostępne we wspólnym rejestrze narzędzi GPT‑Live, Luny i MCP.

Każdy zapisany budzik ma trwały przełącznik włączony/wyłączony. Wyłączenie nie usuwa konfiguracji, a ponowne włączenie budzika cyklicznego wyznacza jego najbliższy termin; tę samą operację udostępnia narzędzie `set_alarm_enabled`.

## Organizacja panelu administratora

Panel `/admin` ma ciemny, zwarty interfejs i wyszukiwarkę nazw, opisów oraz słów kluczowych (również bez polskich znaków). Menu na telefonie rozwija przycisk „Menu konfiguracji”.

- **Pulpit** (`/admin`): bieżący stan i katalog ustawień.
- **Panel tabletu**: ekrany i menu (`views`), gesty i automatyzacje (`rules`), biblioteka (`photos`), wygląd ramki i pogoda (`display`), Spotify (`music`), powiadomienia (`notifications`).
- **Asystent**: modele i instrukcje (`ai`), głos i nasłuch (`voice`), mimika i tryb nocny (`assistant`), konsola (`console`), historia (`history`).
- **System**: narzędzia i MCP (`mcp`), Home Assistant (`ha`), urządzenie (`device`), mapa stanów (`states`).

Każda sekcja ma adres `/admin/<sekcja>` obsługujący odświeżenie oraz Wstecz/Dalej. Rzadziej zmieniane parametry głosu i szczegóły tur historii są zwijane. Formularze zachowują dotychczasowy zapis przyciskiem; przełącznik aktywnego toru GPT-Live/Luna działa natychmiast.

Nowy motyw w `apps/client/src/admin.css` jest ograniczony do `.admin-shell`. Widoki tabletu, Android, API i uprawnienia pozostają bez zmian. Animacje respektują `prefers-reduced-motion`, kontrolki mają widoczny fokus, a menu oznacza stronę przez `aria-current`.

## Uruchomienie

### Music / Spotify

Sekcja **Music · Spotify** w `/admin` zapisuje publiczny Client ID oraz jasność widoku Music. Autoryzacja odbywa się przyciskiem na tablecie. Widok ma artwork, metadane, kontekst, interpolowany postęp, kontrolki playbacku i panel diagnostyki audio. Przyciski uwzględniają ograniczenia zwracane przez konto Spotify. Zmiana widoku nie zatrzymuje odtwarzania. Tap całego ekranu i gest w dół nie wywołują nawigacji z Music; służy do tego Home.

`MusicController` jest oddzielony od Reacta i używa zaufanego bridge. Nie ma jeszcze zdalnego transportu MCP/server→tablet. Up Next i playlisty pokazują jawny stan niedostępności. Szczegóły konfiguracji i pozostałe testy: [Music / Spotify](../../docs/music-spotify.md).

Panel, admin, album i widok HA automatycznie wznawiają WebSocket po rozłączeniu (od 1 do 15 sekund między próbami, z niewielką losową zwłoką). Snapshot przywraca aktualny widok i stan HA; panel oraz album ponownie pobierają ustawienia. Po każdym połączeniu klient porównuje nazwę załadowanego, hashowanego bundla z bieżącym HTML-em serwera i przeładowuje się tylko po wykryciu nowego wdrożenia.

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

### Docker / serwer homelab

Wariant produkcyjny korzysta z obrazu bez uprawnień roota, trwałych katalogów danych i healthchecka:

```bash
cp .env.example .env
docker compose up -d --build
docker compose ps
```

`.env` pozostaje wyłącznie na serwerze. Szczegóły układu katalogów, aktualizacji i przyszłego przeniesienia zdjęć na NAS opisuje [instrukcja wdrożenia](../../docs/deployment.md).

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

When Music is not playing, 30 seconds without interaction starts assistant idle, then photos. Interactions reset the timer; resuming playback cancels it. Tap during this idle returns to Music. Idle duration uses the existing assistant idle setting.

Admin: zakładka „Stany i przejścia” opisuje widoki, Music, Spotify, noc, animacje, album i zasilanie. Czasy/progi pochodzą z formularzy; lista animacji i automatyczne przejścia z reduktora asystenta. To dokumentacja zachowania, nie debugger na żywo.

Zakładka „Asystent AI i MCP” obsługuje tekstowy przepływ Luna → MCP, próbki głosu oraz rozmowę tabletu. Lokalny wake word „Ej Waldek” uruchamia serwerową sesję GPT-Live; PCM 24 kHz płynie przez bridge v6, a delegacje wykonawcze wracają do istniejącej Luny i MCP. Audio zebrane podczas nawiązywania połączenia jest ograniczenie buforowane i trafia do OpenAI dopiero po `session.started`. GPT-Live ma miesięczny limit kosztu i twardy limit sesji. Admin może osobno wyłączyć rozmowę, wake word oraz eksperymentalną obserwację mówcy. Pola ElevenLabs pozostają przygotowane bez aktywnego providera.

Tablet menu: a downward swipe started in the upper 40% opens a glass-style view selector. The top handle is hidden by default so it does not overlap screen content, and Admin > Ekrany i menu > Menu tabletu can restore it. The same section controls the enabled state and ordered visible views (minimum one). Menu overrides the legacy downward-swipe action and suspends inactivity while open.

Menu footer now contains a discreet 17px tablet icon (40px touch area) for exitToTablet, shown only when native capabilities advertise it. Desktop preview and older APKs omit it.

Music includes a glass volume popover: live slider, ±5%, mute/restore, displayed native volume and auto-dismiss after 6 seconds without interaction. Controls tablet media audio, not remote Spotify Connect devices. Accessible without an active Spotify connection when native bridge exists.

Music volume opens from an icon-only button at the right end of playback controls. Shuffle and repeat are grouped as secondary controls on the left.

Shuffle, repeat and volume use borderless icon controls matching track navigation.

Playback controls use symmetric grid tracks: Play stays centered on the seek bar regardless of shuffle/repeat and volume widths. Narrow layouts stack the two secondary icons.

Shuffle and repeat now live in the glass playback-options popover (ellipsis). The control row has one secondary icon on each side of centered playback controls. Outside press or Escape dismisses options.
# Galeria interaktywna

Na tablecie przesunięcie w lewo wybiera następny zestaw, w prawo wraca po historii (do 100 zestawów). Przytrzymanie domyślnie 600 ms otwiera menu Zdjęcia. Menu i przeglądarka wstrzymują pokaz oraz automatyczne przejścia widoków; gest w dół pozostaje menu globalnym. Ręczna zmiana uruchamia odliczanie pokazu od początku.

Tablet i `/admin` → Album zdjęć udostępniają kolekcję oraz „Pobierz nowe”. Miniatury ładowane są leniwie, po 60 pozycji. Admin pozwala obracać o 90°, ukrywać i kadrować zdjęcia przez przeciąganie/przybliżanie, z osobnymi kadrami dla ekranu poziomego i pionowego. Podgląd korzysta z proporcji raportowanego tabletu (domyślnie Redmi Pad 2: 2048×1280) i ma opcję pary zdjęć. Korekty są w runtime `photo-edits.json`; oryginały i Google Photos pozostają niezmienione. „Przywróć oryginał” resetuje korekty po zapisaniu.

Serwer odczytuje prywatne źródło z istniejącego manifestu albumu. Nie przyjmuje URL albumu z przeglądarki. Kontener zawiera moduł synchronizacji; na hoście katalog zdjęć musi być zapisywalny dla UID 10001. Synchronizator CLI i przycisk współdzielą blokadę `.walldeck-sync.lock`. Po awaryjnym zakończeniu procesu usuń pozostały katalog blokady dopiero po sprawdzeniu, że żaden synchronizator nie działa.

Globalne powiadomienia są kolejkowane i deduplikowane, z akcją „Zobacz”. Serwer wykrywa zmiany manifestu co 10 sekund, również z harmonogramu CLI. Pierwsze wczytanie kolekcji nie generuje komunikatu. Czas przytrzymania, czas komunikatu i powiadamianie o nowych zdjęciach konfiguruje admin. Aktualna synchronizacja nadal korzysta z parsera udostępnionego albumu; zmiany strony Google mogą wymagać jego aktualizacji.
# Dyskretne podpisy zdjęć

Ramka pokazuje przy dolnej krawędzi każdego zdjęcia drobny podpis (10 px, biel 60%, bez tła): datę wykonania EXIF DateTimeOriginal oraz dostępne miejsce z IPTC/XMP. Przy braku nazwy miejsca współrzędne GPS są prezentowane do dwóch miejsc po przecinku; nie korzystamy z zewnętrznego geokodowania. Brak danych oznacza brak podpisu. Nie używamy daty pobrania, modyfikacji pliku ani CreateDate. Zachowujemy kalendarzową datę aparatu bez przeliczeń strefy czasowej. Endpoint metadanych odczytuje oryginał na żądanie i buforuje wynik według rozmiaru/mtime.
# Powiadomienia globalne

Admin → Powiadomienia ustawia osobno komunikaty zwykłe i alarmowe. Zwykłe mają czas 2–60 s i opcjonalny delikatny sygnał lub chime. Alarm może pozostać do ręcznego zamknięcia albo zniknąć po 5–600 s; trafia przed zwykłe komunikaty i może odtworzyć wyraźny sygnał. Wspólna regulacja głośności dotyczy wyłącznie syntezowanych dźwięków WebPanelu. Na tablecie bridge odtwarza je natywnie przez wbudowany głośnik, niezależnie od trasy Bluetooth używanej przez muzykę; Web Audio pozostaje fallbackiem w zwykłej przeglądarce. Próbki działają przed zapisaniem formularza.

Kontrakt `AppNotification` przyjmuje `priority`, `persistent`, `durationMs`, `sound`, `volume` i zarezerwowane `ttsText`. Integracje zwykle powinny podać tylko treść, rodzaj i priorytet, aby respektować globalną konfigurację. TTS pozostaje widocznym TODO do czasu wdrożenia silnika, ciszy nocnej i audio focus.
