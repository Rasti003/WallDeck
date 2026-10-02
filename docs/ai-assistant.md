# Asystent AI

Pierwsza wersja asystenta działa jako konsola tekstowa w `/admin`. Nie korzysta jeszcze z mikrofonu, wake wordu ani głośnika tabletu. Polecenia są interpretowane przez OpenAI Agents SDK, a dostęp do WallDeck odbywa się wyłącznie przez lokalny endpoint MCP i narzędzia włączone w sekcji **MCP · AI**.

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

- zamyka sesję po skonfigurowanej ciszy od ostatniego fragmentu audio;
- wymusza twardy limit czasu całej sesji;
- wysyła `session.close`, czeka na `session.closed` i zapisuje końcowe `usage.seconds`;
- przechowuje miesięczny licznik w prywatnym runtime `assistant-voice-usage.json`;
- po osiągnięciu budżetu lub błędzie GPT-Live przechodzi na `gpt-4o-mini-tts`, jeżeli fallback jest włączony.

Domyślnie limit wynosi 15 USD miesięcznie, sesja najwyżej 30 sekund, a zamknięcie następuje 2 sekundy po ostatnim fragmencie audio. Limit dotyczy szacowanego kosztu samej sesji Live według stawki 0,05 USD/min; użycie Luny i narzędzi jest rozliczane osobno. Jedna sesja może nieznacznie przekroczyć próg, ponieważ końcowe użycie jest znane dopiero po jej zamknięciu.

Pola modelu i Voice ID ElevenLabs należą już do wspólnego kontraktu ustawień. Endpoint celowo odrzuca tę opcję do czasu dodania osobnego, szyfrowanego klucza i implementacji providera.

Integracja lokalny wake word „Ej Waldek” → mikrofon → rozmowa Live na tablecie jest kolejnym etapem. Dla przyszłej sesji audio timeout ma uwzględniać aktywność mikrofonu, odtwarzanie i trwające narzędzia; sam brak fragmentów transkrypcji nie jest uznawany za ciszę.

## Bezpieczeństwo i koszty

- odpowiedzi i wywołania narzędzi nie są wysyłane do telemetrii Agents SDK (`tracingDisabled`);
- odpowiedzi Responses API nie są zapisywane (`store: false`);
- jednocześnie może działać tylko jedno polecenie;
- długość promptu, liczba tur i pola konfiguracyjne mają limity;
- GPT-Live ma limit miesięczny, limit pojedynczej sesji i trwały licznik użycia;
- wyłączenie asystenta lub eskalacji działa natychmiast;
- MCP pozostaje jedyną warstwą wykonawczą, więc każde narzędzie można osobno wyłączyć.

Testy automatyczne nie łączą się z OpenAI i nie wykonują akcji Spotify. Sprawdzają między innymi szyfrowanie klucza oraz składanie śladu wywołań MCP.
