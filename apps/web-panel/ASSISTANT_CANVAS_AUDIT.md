# Audyt rozmowy i Canvas — 3–4 października 2026

## Decyzja

GPT-Live odpowiada z wiedzy ogólnej i sam ocenia użyteczność obrazu. Backend szybko kolejkuje `prepare_assistant_canvas`; osobny worker Luny równolegle przygotowuje tekst i wyszukuje zdjęcia. Częściowe wyniki aktualizują ten sam dokument. Bieżące dane, jawne wyszukiwania i pomiary HA nadal wymagają prawdziwych wyników narzędzi przed odpowiedzią.

## Znalezione problemy i naprawy

- `await executeLiveTool` wewnątrz iteratora Live wstrzymywało odbiór kolejnych zdarzeń, także audio. Kolejka narzędzi działa niezależnie; kontynuacja czeka na wszystkie wyniki i response.completed. Powtórzone call_id są ignorowane.
- Klient uruchamiał osobnego agenta po ciszy mimo istniejącej delegacji Responses. Usunięto tę ścieżkę, opóźniony fallback startowej komendy i listę niedokończonych końcówek.
- Serwer wymuszał wizualną delegację przy częściowej transkrypcji za pomocą słów kluczowych i session.instructions.append. Usunięto tę ingerencję; decyzja należy do modelu na podstawie pełnej prośby. Z logów bez zapisanego audio nie można rozstrzygnąć wszystkich przyczyn uciętego rozpoznania „husky”.
- Polecenie prezentacji wymuszało pełny web search również dla wiedzy podstawowej. Teraz głos i tekst nie zależą od wyszukiwarki zdjęć. Worker nie dostaje narzędzi operacyjnych i nie może sterować domem.
- Opóźniona prezentacja mogła nadpisać nowy temat lub odtworzyć stary widok. Wprowadzono anulowanie i sprawdzanie właściciela zadania, rewizje dokumentu, limit 60 s i jawne stany częściowego błędu/anulowania. Tylko początek zadania aktywuje ekran.
- Cache obrazów usuwał adresy poprzedniego dokumentu przy każdym update. Zachowuje do 32 wpisów / 80 MB, z istniejącą walidacją HTTPS, MIME i pobrania. Źródła dopuszczają tylko HTTP(S).
- Live mógł próbować uruchomić własny TTS lub nową rozmowę. Te dwa narzędzia są usunięte z jego listy i zablokowane także w executorze. Pozostają dostępne dla harmonogramu.
- Błąd agenta mógł odtworzyć całe polecenie na modelu zapasowym, powielając wcześniejsze akcje. Usunięto taki retry; jawna eskalacja dopuszczalna jest tylko bez wcześniejszych tool calls.
- Motion nadpisywał CSS translateX paska statusu. Centrowanie jest teraz częścią transformacji Motion. Galeria i placeholder mają przewidywalny rozmiar, nie rozpychają tekstu.
- Test integracyjny wykrył odrzucenie formatu JSON przez API. Dodano jawne żądanie JSON w input, nie tylko w instrukcjach. Worker opisuje temat, nie ogłasza sam dostępności zdjęć.
- Jedna próba z wcześniejszym profilem przekroczyła 35 s delegacji bez wywołania narzędzia. Backend wyboru narzędzi dla gpt-6-luna używa teraz low, tekst Canvas none. Limit wynosi 60 s, przekroczenie jest jawnym błędem. Dziennik zapisuje fazy Responses, nazwy narzędzi, jobId i czasy Canvas.

## Weryfikacja

- `pnpm test`: PASS, 48 testów klienta + 57 serwera + 2 synchronizatora = 107.
- `pnpm build` oraz produkcyjny build Docker: PASS. Pozostało znane ostrzeżenie Vite o wielkości wspólnego bundla; nie jest błędem kompilacji.
- Automatyczne regresje: oba porządki response.completed/tool output, brak blokady kolejki zdarzeń, deduplikacja, zamknięcie sesji, anulowanie starego tematu, deadline, obraz przed tekstem, tekst przed obrazem, częściowy błąd, przełączniki narzędzi i brak odtwarzania wykonanych akcji.
- Prawdziwe API, syntetyzowana wypowiedź „Opowiedz mi krótko o kotach rasy sfinks i pokaż prezentację ze zdjęciami”: PASS na wdrożeniu beaecfe. Audio wejścia 4,69 s. Od otwarcia połączenia: pierwszy głos 7,55 s, tekst 12,16 s, trzy obrazy 15,80 s. Od przyjęcia zlecenia Canvas: tekst 3,57 s, obrazy 7,22 s. Głos opowiadał w trakcie pracy; brak błędów sesji.
- Test wiadomości początkowej „Opowiedz mi krótko o Jowiszu”: PASS, model sam wybrał Canvas bez jawnej prośby o ekran. Głos 4,40 s, tekst 8,41 s, trzy zdjęcia 11,31 s od otwarcia połączenia.
- UI sprawdzone w przeglądarce 1280×720: czytelny tekst, placeholder oraz po uzupełnieniu trzy zdjęcia obok faktów bez rozciągania galerii poza pierwszy ekran.
- Ręczny, opt-in test: `WALLDECK_URL=http://host:8080 node tools/live-canvas-smoke.mjs "polecenie" --audio-input`. Używa płatnego API i zmienia Canvas. Bez flagi sprawdza wiadomość startową plus ciche PCM. Nie zapisuje audio na dysk.

## Granice pomiaru

Pomiary są pojedynczymi próbami API, nie gwarancją opóźnienia. Nie obejmują fizycznego mikrofonu, wake wordu ani odsłuchu głośnika. Nie wykonano nowego testu fizycznego Androida i nie zmieniono jego APK/bridge. Proaktywne wybranie Canvas jest decyzją modelu, nie twardą regułą tematów. Wyniki bieżącego workeru są ulotne; diagnostyki są trwałe.

## Dokumentacja API

- https://developers.openai.com/api/docs/guides/live-delegation
- https://developers.openai.com/api/docs/guides/tools-web-search
- https://developers.openai.com/api/docs/models/gpt-6-luna
