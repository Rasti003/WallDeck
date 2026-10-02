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

Bridge v6 dodaje natywny tor PCM 24 kHz. Android korzysta wyłącznie z lokalnego `SpeechRecognizer` do wykrycia „Ej Waldek”; jeżeli urządzenie nie ma recognizera on-device, moduł zgłasza niedostępność i nie przechodzi na rozpoznawanie chmurowe. Po wykryciu frazy recognizer zwalnia mikrofon, a `AudioRecord` przesyła kolejne fragmenty przez zaufany bridge i WebSocket WallDeck Server do GPT-Live. Odpowiedź PCM wraca do natywnego `AudioTrack`, który preferuje wbudowany głośnik tabletu.

Prototyp działa jako pojedyncza, półdupleksowa tura: po nadejściu pierwszego fragmentu odpowiedzi zatrzymuje wejście mikrofonowe, odtwarza całą kolejkę PCM, zamyka płatną sesję i wraca do lokalnego wake wordu. Zapobiega to ponownemu rozpoznawaniu głosu asystenta na głośniku tabletu oraz przypadkowym kolejnym turom od dźwięków otoczenia. Pełny dialog wieloturowy i barge-in pozostają zadaniem po pomiarze VAD oraz eliminacji echa na docelowym montażu.

GPT-Live prowadzi rozmowę i deleguje działania do klienta. Klient wywołuje dotychczasową ścieżkę Luna → MCP, a zweryfikowany wynik zwraca do sesji przez `session.commentary.append`. Zwykła wypowiedź modelu nie wymaga narzędzia `speak`; osobne narzędzie będzie potrzebne dopiero dla komunikatów inicjowanych poza aktywną rozmową.

Pierwszy prototyp wymaga krótkiej pauzy po wake wordzie, aby lokalny recognizer zdążył zwolnić mikrofon. Jeśli recognizer zwróci również dalszą część wypowiedzi, klient zachowuje ją jako tekstowe polecenie i przekazuje wynik do GPT-Live do wypowiedzenia. Sesja zamyka się po ciszy po odpowiedzi albo po twardym limicie, a lokalny nasłuch uruchamia się ponownie.

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
