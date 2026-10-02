# Asystent AI

Pierwsza wersja asystenta działa jako konsola tekstowa w `/admin`. Nie korzysta jeszcze z mikrofonu, wake wordu ani głośnika tabletu. Polecenia są interpretowane przez OpenAI Agents SDK, a dostęp do WallDeck odbywa się wyłącznie przez lokalny endpoint MCP i narzędzia włączone w sekcji **MCP · AI**.

## Konfiguracja

W sekcji **Asystent AI** można ustawić:

- klucz OpenAI API — szyfrowany AES-256-GCM w katalogu runtime i nigdy zwracany do przeglądarki;
- model podstawowy i poziom rozumowania;
- opcjonalny model mocniejszy oraz całkowite wyłączenie automatycznej eskalacji;
- limit tur chroniący przed niekontrolowaną pętlą narzędzi;
- instrukcję systemową;
- opcjonalny model TTS, głos i sposób mówienia.

Domyślna konfiguracja używa `gpt-6-luna` z rozumowaniem `medium`. Model może poprosić o pojedynczą eskalację, zaczynając wynik od `ESCALATE:`; wtedy serwer ponawia polecenie przez skonfigurowany model mocniejszy. Administrator może również wymusić mocniejszy model dla konkretnego polecenia. Eskalacja nigdy nie tworzy dalszego łańcucha.

## Wymagania uruchomieniowe

1. Ustaw `WALLDECK_MCP_TOKEN` w serwerowym `.env`.
2. Włącz MCP i wybrane narzędzia w panelu administratora.
3. Zapisz klucz OpenAI API w sekcji **Asystent AI**.
4. Włącz asystenta.

Każde polecenie otwiera świeże lokalne połączenie MCP, dlatego lista dostępnych narzędzi odpowiada bieżącym przełącznikom administratora. Odpowiedź pokazuje użyty model, informację o eskalacji i ślad wywołań MCP wraz z wynikiem.

## Głos

TTS jest opcjonalny. W tej wersji przycisk próbki generuje dźwięk przez OpenAI i odtwarza go wyłącznie w przeglądarce administratora po ręcznym kliknięciu. Tablet pozostaje cichy. Integracja wake word → STT → asystent → TTS na tablecie jest kolejnym etapem.

## Bezpieczeństwo i koszty

- odpowiedzi i wywołania narzędzi nie są wysyłane do telemetrii Agents SDK (`tracingDisabled`);
- odpowiedzi Responses API nie są zapisywane (`store: false`);
- jednocześnie może działać tylko jedno polecenie;
- długość promptu, liczba tur i pola konfiguracyjne mają limity;
- wyłączenie asystenta lub eskalacji działa natychmiast;
- MCP pozostaje jedyną warstwą wykonawczą, więc każde narzędzie można osobno wyłączyć.

Testy automatyczne nie łączą się z OpenAI i nie wykonują akcji Spotify. Sprawdzają między innymi szyfrowanie klucza oraz składanie śladu wywołań MCP.
