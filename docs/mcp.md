# Serwer MCP WallDeck

WallDeck udostępnia kontrolowany interfejs Model Context Protocol pod adresem `/mcp`. To warstwa wykonawcza przyszłego asystenta: model może odczytać stan panelu i wywołać wyłącznie jawnie zdefiniowane funkcje. Generowanie wypowiedzi, pamięć rozmowy, mikrofon, wake word i TTS pozostają osobnymi modułami.

## Dostępne narzędzia

| Narzędzie | Typ | Zakres |
|---|---|---|
| `get_status` | odczyt | aktywny widok, tablet, HA i aktywne narzędzia |
| `get_current_time` | odczyt | bieżąca data, godzina, dzień tygodnia i przesunięcie UTC dla `Europe/Warsaw` |
| `show_view` | akcja | zdjęcia, Dom, Music lub twarz asystenta |
| `show_assistant_mood` | akcja | jedna z walidowanych animacji/nastrojów twarzy |
| `control_music` | akcja | play, pauza, następny, poprzedni, seek, shuffle, repeat |
| `search_spotify` | odczyt | wyszukiwanie utworów, albumów, artystów, playlist i podcastów |
| `get_spotify_queue` | odczyt | aktualnie odtwarzany element i kolejka Spotify |
| `list_spotify_playlists` | odczyt | playlisty zalogowanego konta Spotify |
| `play_spotify_item` | akcja | odtworzenie wskazanego URI Spotify |
| `add_spotify_to_queue` | akcja | dodanie utworu lub podcastu do kolejki |
| `set_tablet_volume` | akcja | głośność multimediów 0–100% |
| `adjust_tablet_volume` | akcja | względna zmiana głośności multimediów |
| `send_notification` | akcja | komunikat zwykły lub alarm z opcjonalnym dźwiękiem |
| `set_view_brightness` | akcja | zapisana jasność konkretnego widoku |
| `search_home_entities` | odczyt | wyszukanie encji Home Assistant |
| `get_home_entity` | odczyt | stan wskazanej encji Home Assistant |
| `list_schedules` | odczyt | minutniki, budziki i zadania asystenta wraz ze stanem, identyfikatorem i ostatnim wynikiem |
| `create_timer` | akcja | minutnik z etykietą i opcjonalnym promptem wykonywanym po wybiciu |
| `create_alarm` | akcja | budzik jednorazowy albo cykliczny w strefie `Europe/Warsaw` |
| `create_assistant_task` | akcja | ciche jednorazowe albo cykliczne zadanie z obowiązkową instrukcją dla asystenta |
| `set_alarm_enabled` | akcja | włączenie lub wyłączenie zapisanego budzika bez usuwania go |
| `cancel_schedule` | akcja | trwałe usunięcie minutnika, budzika lub zadania |
| `dismiss_schedule` | akcja | wyłączenie alarmu; cykliczny budzik planuje kolejne wystąpienie |
| `snooze_schedule` | akcja | odłożenie alarmu o 1–180 minut |

W `/admin` sekcja **Asystent AI i MCP** pokazuje jeden katalog narzędzi używany przez GPT‑Live, Lunę i endpoint MCP. Definicja zawiera jeden identyfikator, opis, schemat parametrów i handler wykonawczy; dodanie nowego narzędzia nie wymaga osobnej implementacji dla każdego toru. Wyłączenie funkcji usuwa ją ze wszystkich list przekazywanych modelom. Osobny przełącznik steruje wyłącznie dostępnością zewnętrznego endpointu `/mcp`.

## Bezpieczeństwo

- endpoint wymaga `Authorization: Bearer <WALLDECK_MCP_TOKEN>`;
- token jest zmienną środowiskową serwera, nie jest zwracany przez API ani zapisywany w repozytorium;
- serwer jest domyślnie wyłączony w ustawieniach;
- parametry narzędzi mają ścisłe schematy i ograniczone zakresy;
- MCP nie może opuścić kiosku, odczytać sekretów, edytować całych ustawień ani wykonać dowolnej usługi HA;
- obecny endpoint LAN używa HTTP i nie powinien być publicznie wystawiany.

Połączenie z OpenAI API wymaga bezpiecznego transportu do prywatnego homelabu. Docelowym wariantem jest Secure MCP Tunnel lub publiczny endpoint HTTPS z właściwym uwierzytelnieniem. Po stronie wywołania modelu dodatkowo ograniczamy `allowed_tools` i ustawiamy politykę zatwierdzania operacji.

## Przepływ komendy

```text
OpenAI / klient MCP
        │  Streamable HTTP + Bearer
        ▼
WallDeck Server /mcp
        │  walidacja + lista aktywnych tools
        ├────────► ustawienia / Home Assistant / powiadomienia
        │
        └────────► WebSocket command bus ─────► aktywny tablet/WebView ─────► Android Bridge / Spotify
```

Serwer kieruje komendę sprzętową do aktywnego panelu i czeka maksymalnie 8 sekund na odpowiedź. Brak połączonego tabletu lub błąd bridge'a wraca do klienta MCP jako błąd narzędzia.

Narzędzia harmonogramu korzystają z trwałego magazynu serwera. `automationPrompt` nie jest mapowany na konkretną integrację: po wybiciu serwer przekazuje jego tekst do istniejącego asystenta, który widzi dokładnie swój aktualnie włączony zestaw narzędzi. Zadanie może więc później użyć komunikatora, poczty lub innej integracji, gdy jej ograniczone narzędzie zostanie dodane i włączone. Brak potrzebnego narzędzia kończy wykonanie błędem zapisanym w historii; scheduler nie udaje wysłania wiadomości.

## Następny etap asystenta

1. Połączyć prywatny endpoint MCP z OpenAI Responses API.
2. Dodać orkiestrator rozmowy oraz jasną politykę zatwierdzania akcji.
3. Dodać wejście mikrofonowe, wake word, STT i TTS jako niezależne moduły z osobnymi przełącznikami.
4. Dodać koordynator audio focus, który ścisza muzykę na czas rozmowy i bezpiecznie przywraca odtwarzanie.
5. Rozbudować narzędzia dopiero po przygotowaniu konkretnych, ograniczonych przypadków użycia.
