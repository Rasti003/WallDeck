# Asystent AI

Asystent działa jako konsola tekstowa w `/admin` oraz eksperymentalna rozmowa głosowa na tablecie. Polecenia wykonawcze są interpretowane przez OpenAI Agents SDK, a dostęp do WallDeck odbywa się wyłącznie przez lokalny endpoint MCP i narzędzia włączone w sekcji **MCP · AI**.

## Konfiguracja

W jednej sekcji **Asystent AI i MCP** można ustawić modele oraz niżej kontrolować dostępne narzędzia:

- klucz OpenAI API — szyfrowany AES-256-GCM w katalogu runtime i nigdy zwracany do przeglądarki;
- model podstawowy i poziom rozumowania;
- opcjonalny model mocniejszy oraz całkowite wyłączenie automatycznej eskalacji;
- limit tur chroniący przed niekontrolowaną pętlą narzędzi;
- instrukcję systemową;
- dostawcę głosu, miesięczny budżet GPT-Live, limity sesji oraz konfigurację awaryjnego TTS.

Domyślna konfiguracja używa `gpt-6-luna` z rozumowaniem `medium`. Model może poprosić o pojedynczą eskalację, zaczynając wynik od `ESCALATE:`; wtedy serwer ponawia polecenie przez skonfigurowany model mocniejszy. Administrator może również wymusić mocniejszy model dla konkretnego polecenia. Eskalacja nigdy nie tworzy dalszego łańcucha.

## Wymagania uruchomieniowe

1. Ustaw `WALLDECK_MCP_TOKEN` w serwerowym `.env`.
2. Włącz MCP i wybrane narzędzia w panelu administratora.
3. Zapisz klucz OpenAI API w sekcji **Asystent AI**.
4. Włącz asystenta.

Każde polecenie otwiera świeże lokalne połączenie MCP, dlatego lista dostępnych narzędzi odpowiada bieżącym przełącznikom administratora. Odpowiedź pokazuje użyty model, informację o eskalacji i ślad wywołań MCP wraz z wynikiem.

## Głos

Głos jest opcjonalny. Administrator wybiera `GPT-Live`, oszczędny `gpt-4o-mini-tts` lub przygotowaną, jeszcze nieaktywną konfigurację ElevenLabs. Przycisk próbki odtwarza dźwięk wyłącznie w przeglądarce administratora po ręcznym kliknięciu; tablet pozostaje cichy.

GPT-Live dostaje zweryfikowany tekst odpowiedzi z istniejącego asystenta i zwraca PCM 24 kHz opakowane przez serwer jako WAV. Sesja nie przejmuje jeszcze mikrofonu ani narzędzi — Luna i MCP pozostają dotychczasową warstwą wykonawczą. Serwer:

- zamyka sesję po skonfigurowanej ciszy od ostatniego słyszalnego fragmentu PCM;
- wymusza twardy limit czasu całej sesji;
- wysyła `session.close`, czeka na `session.closed` i zapisuje końcowe `usage.seconds`;
- przechowuje miesięczny licznik w prywatnym runtime `assistant-voice-usage.json`;
- po osiągnięciu budżetu lub błędzie GPT-Live przechodzi na `gpt-4o-mini-tts`, jeżeli fallback jest włączony.

Domyślnie limit wynosi 15 USD miesięcznie, sesja najwyżej 30 sekund, a zamknięcie następuje 2 sekundy po ostatnim fragmencie audio. Limit dotyczy szacowanego kosztu samej sesji Live według stawki 0,05 USD/min; użycie Luny i narzędzi jest rozliczane osobno. Jedna sesja może nieznacznie przekroczyć próg, ponieważ końcowe użycie jest znane dopiero po jej zamknięciu.

Pola modelu i Voice ID ElevenLabs należą już do wspólnego kontraktu ustawień. Endpoint celowo odrzuca tę opcję do czasu dodania osobnego, szyfrowanego klucza i implementacji providera.

## Rozmowa na tablecie

Bridge v7 dodaje natywny tor PCM 24 kHz i potwierdzenie opróżnienia kolejki wyjściowej. Wake word działa w ciągłym, lokalnym strumieniu Vosk 16 kHz z polskim modelem `vosk-model-small-pl-0.22`; nie korzysta z usługi rozpoznawania Google ani chmury. Przy pierwszym uruchomieniu APK pobiera oficjalny model 50,5 MiB, weryfikuje przypiętą sumę SHA-256 i zapisuje go w prywatnym katalogu. Po wykryciu frazy Vosk zwalnia mikrofon, a `AudioRecord` przesyła wypowiedź przez zaufany bridge i WebSocket WallDeck Server do GPT-Live. Odpowiedź PCM wraca do natywnego `AudioTrack`, który preferuje wbudowany głośnik tabletu.

Admin pokazuje trwałą historię ostatnich 100 tur ścieżki Luna, konsoli tekstowej i zadań uruchomionych przez harmonogram Zegara. Każdy wpis zawiera źródło, transkrypcję lub prompt zadania, dokładne wejście i instrukcję systemową każdego uruchomionego modelu, odpowiedź, wywołania MCP wraz z argumentami i wynikami, końcowy tekst TTS oraz błąd. Wykonania harmonogramu są oznaczone jako `Harmonogram · Luna`, dzięki czemu powiadomienia i inne ciche akcje można sprawdzić niezależnie od krótkiego wyniku przy samym zadaniu. Historia znajduje się w `assistant-history.json` w prywatnym runtime i może zostać wyczyszczona z panelu. Surowe audio i klucze API nie są zapisywane.

Na górze sekcji Asystent znajduje się natychmiastowy przełącznik `GPT-Live / Luna`. Zapisuje wyłącznie wybór aktywnego toru, rozsyła zmianę do tabletu przez istniejący `settings.changed` i nie zeruje konfiguracji żadnego z trybów. Klient aktualizuje jeden stale działający `VoiceAssistantRuntime`, dzięki czemu zmiana trybu nie wyłącza i nie uruchamia ponownie wake wordu; aktywna rozmowa jest najpierw zamykana, a nasłuch konfigurowany z nowym trybem. Szczegółowy selektor pozostaje również w formularzu konfiguracji.

Stały strumień usuwa miganie wskaźnika wywołane restartami `SpeechRecognizer`. Android nadal pokazuje systemowy wskaźnik użycia mikrofonu, gdy wake word jest aktywny; zwykła aplikacja nie może go ukryć. Wyłączenie wake wordu w adminie zamyka strumień i usuwa wskaźnik.

Prototyp działa jako pojedyncza, półdupleksowa tura: po nadejściu pierwszego fragmentu odpowiedzi zatrzymuje wejście mikrofonowe, odtwarza całą kolejkę PCM, zamyka płatną sesję i wraca do lokalnego wake wordu. Klient i serwer wyliczają czas kolejki z liczby bajtów PCM 24 kHz; timeout serwera obejmuje pozostały czas odtwarzania, dlatego szybkie wygenerowanie dłuższej wypowiedzi nie czyści jej przed końcem. Zapobiega to ponownemu rozpoznawaniu głosu asystenta na głośniku tabletu oraz przypadkowym kolejnym turom od dźwięków otoczenia. Pełny dialog wieloturowy i barge-in pozostają zadaniem po pomiarze VAD oraz eliminacji echa na docelowym montażu.

GPT-Live prowadzi rozmowę i deleguje działania do backendu Responses. Backend otrzymuje ograniczony zestaw narzędzi odpowiadający przełącznikom MCP w adminie i zwraca wynik do tej samej sesji. Narzędzia czasu w obu torach korzystają ze wspólnego źródła `Europe/Warsaw`, więc pytania o godzinę, datę, dziś lub jutro nie zależą od wiedzy modelu. Delegacja klienta pozostaje dostępna dla starszego toru Luna → MCP. Zwykła wypowiedź modelu nie wymaga narzędzia `speak`; osobne narzędzie będzie potrzebne dopiero dla komunikatów inicjowanych poza aktywną rozmową.

Vosk używa ograniczonej gramatyki wariantów „Ej/Hej Waldek” oraz ostrożnego dopasowania fonetycznego, zamiast próbować rozpoznawać całe otoczenie. Po detekcji panel natychmiast przełącza mikrofon na tor rozmowy i buforuje do 5 sekund PCM podczas zestawiania WebSocketu, dlatego polecenie można wypowiedzieć płynnie zaraz po haśle. Klient i serwer nie przekazują bufora dalej, dopóki Live nie potwierdzi `session.started`; protokół wymaga, by `session.start` był pierwszym zdarzeniem. Krótka pauza nadal pomaga, ale nie jest wymagana do zachowania początku komendy. Sesja zamyka się po odpowiedzi albo po twardym limicie, lokalny nasłuch uruchamia się ponownie, a router przywraca widok sprzed rozmowy (lub Music, gdy trwa odtwarzanie).

Eksperymentalna obserwacja mówcy oblicza lokalnie prosty fingerprint akustyczny i grupuje próbki jako `Głos 1–3`. Do serwera trafia tylko etykieta, pewność i czas obserwacji. Funkcję można wyłączyć; wynik nie wpływa na pamięć, narzędzia ani uprawnienia i nie jest traktowany jako uwierzytelnienie.

## Bezpieczeństwo i koszty

- odpowiedzi i wywołania narzędzi nie są wysyłane do telemetrii Agents SDK (`tracingDisabled`);
- odpowiedzi Responses API nie są zapisywane (`store: false`);
- jednocześnie może działać tylko jedno polecenie;
- długość promptu, liczba tur i pola konfiguracyjne mają limity;
- GPT-Live ma limit miesięczny, limit pojedynczej sesji i trwały licznik użycia;
- wyłączenie asystenta lub eskalacji działa natychmiast;
- MCP pozostaje jedyną warstwą wykonawczą, więc każde narzędzie można osobno wyłączyć.

Testy automatyczne nie łączą się z OpenAI i nie wykonują akcji Spotify. Sprawdzają między innymi szyfrowanie klucza oraz składanie śladu wywołań MCP.
