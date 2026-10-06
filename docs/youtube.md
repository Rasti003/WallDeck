# YouTube — Media Surface

YouTube działa w webowym panelu `/youtube` i w menu tabletu jako osobny widok. Korzysta z oficjalnego YouTube IFrame Player API. Nie wymaga konta YouTube, OAuth ani Device Owner. Android udostępnia odtwarzanie bez gestu (`mediaPlaybackRequiresUserGesture=false`) w obu wariantach APK; treści i sterowanie należą do webu.

## Konfiguracja

1. W Google Cloud włącz YouTube Data API v3 i utwórz klucz API. Ogranicz go do tego API i, jeśli serwer ma stały publiczny adres wyjściowy, do tego adresu IP. Klucz jest używany przez backend, więc ograniczenie do HTTP referrerów przeglądarki nie pasuje do tej integracji.
2. Otwórz `/admin/youtube` → Media → YouTube, zapisz klucz i włącz funkcję. Użyj przycisku Test API. Klucz nigdy nie jest zwracany w statusie.
3. W Ekrany i menu dodaj YouTube do menu tabletu. Widok jest również dostępny przez polecenia asystenta.
4. Dodaj kanał przez @handle, adres `youtube.com/@handle`, `/channel/UC…` albo channelId. Nazwa bez jednoznacznego dopasowania zwraca kandydatów do wyboru. Alias można poprawić lub usunąć wpis i dodać właściwy kanał.

Status pokazuje liczbę rzeczywistych wywołań API od restartu i ostatni bezpieczny błąd. Pozostały limit sprawdza się w Google Cloud Console — nie jest zgadywany przez WallDeck. Nie ma ponawiania pętli przy błędach quota.

## Zachowanie

- `youtube_search(query,limit?)` wyświetla wyniki bez odtwarzania. `youtube_play(videoId)` albo `youtube_play(index)` uruchamia wybrany film; numer jest od 1 i odnosi się do ostatnich wyników.
- `youtube_play_latest(channel,mode=normal)` rozwiązuje kanał, następnie czyta playlistę uploads (do trzech stron po 50 wpisów) i szczegóły filmów. Pomija live/upcoming, prywatne, usunięte i nieosadzalne materiały oraz filmy krótsze od ustawionego progu (domyślnie 181 s). To heurystyka długości, a nie pole `isShort`.
- `youtube_control(action,value?)`: pause/resume/stop/returnView, seek/seekBy (sekundy), volume (0–100), restart oraz next/previous w ostatnich wynikach. `youtube_get_state` zwraca film, pozycję, wyniki, returnView i status playera.
- Narzędzia mają wspólną walidację i przełączniki dla Live, Luny i MCP. `loading` oznacza przyjęte polecenie, `playing` faktyczne odtwarzanie, `blocked` potrzebę dotknięcia „Uruchom film”. Asystent nie powinien potwierdzać odtwarzania przed stanem playing.
- Media Surface wstrzymuje Spotify przed startem YouTube i zatrzymuje YouTube przed startem Spotify. Rozmowa pozostaje nad playerem, ścisza film do maksymalnie 20% i przywraca poprzednią głośność po zakończeniu. Player nie ma elementów WallDeck przykrywających reklam ani kontrolek YouTube.
- Zamknięcie, stop i koniec filmu (autoNext wyłączone) wracają do zapamiętanego ekranu. Zmiana widoku usuwa player i zapisuje pozycję. Film nie jest odtwarzany w tle. Natywny audio focus i akustyczne usuwanie echa to osobne przyszłe zadania.
- Błąd osadzania pokazuje link do YouTube. „Najnowszy” próbuje do trzech kandydatów po błędzie playera; nie tworzy nieskończonej kolejki ponowień.

## Dane

`youtube.json` zawiera konfigurację bez klucza, kanały i maksymalnie 100 ostatnich pozycji oglądania (do 30 dni). Dane kanału odświeżają się po 30 dniach. Wyszukiwania mają cache w pamięci na 15 minut, najnowsze uploads na 3 minuty; restart i przycisk admina czyszczą cache. Równoległe identyczne wyszukiwania współdzielą zapytanie.

Klucz: `youtube-api-key.secret.json`, AES-256-GCM, lokalny `.youtube-api-key.key`, uprawnienia 0600. Kopia runtime musi obejmować oba pliki. Raporty playera co 5 sekund oraz na zmianach stanu zapisują pozycję; identyfikator sesji odrzuca spóźnione raporty poprzedniego filmu, także gdy ponownie odtwarzany jest ten sam videoId. Wznowienie po restarcie nie jest częścią MVP.

## Weryfikacja

`pnpm test` obejmuje granicę 180/181 s, stronicowanie uploads, filtrowanie live/prywatnych/nieosadzalnych filmów, niejednoznaczne kanały, aliasy, cache, wybór numeru wyniku, pozycję, powrót, szyfrowanie klucza i przełączniki narzędzi. Testy używają kontrolowanych odpowiedzi Data API i nie zużywają quota.

Build Androida: `scripts/build.ps1` i `scripts/build.ps1 -Standard` — każdy uruchamia assembleDebug, testDebugUnitTest, lintDebug. Rzeczywiste wyniki na tablecie są zapisywane wyłącznie w `apps/tablet-android/TEST_REPORT.md`. Pełny test wyszukiwania/latest z rzeczywistym Data API wymaga klucza skonfigurowanego przez administratora.

Źródła: [IFrame API](https://developers.google.com/youtube/iframe_api_reference), [videos.list](https://developers.google.com/youtube/v3/docs/videos/list), [channels.list](https://developers.google.com/youtube/v3/docs/channels/list), [wymagania YouTube API](https://developers.google.com/youtube/terms/required-minimum-functionality).
