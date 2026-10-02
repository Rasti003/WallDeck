# WallDeck Speaker Service

Lokalny, opcjonalny proces obserwacji mówcy. Serwis przyjmuje krótkie fragmenty PCM16, używa Silero VAD do odrzucenia ciszy i ECAPA-TDNN ze SpeechBrain do utworzenia znormalizowanego embeddingu głosu. Nie przechowuje surowego audio ani embeddingów; kotwica bieżącej rozmowy pozostaje w pamięci procesu WallDeck Server.

`pyannote.audio` nie jest instalowane. Pełna diarizacja jest celowo poza domyślnym torem ze względu na koszt CPU i brak natywnego strumieniowania. Może później powstać jako osobny eksperyment.

## API

- `GET /health` — gotowość modeli i liczba wątków Torch.
- `POST /v1/analyze` — surowy mono PCM16 little-endian; nagłówek `x-sample-rate` określa częstotliwość. Odpowiedź zawiera czas mowy, czas obliczeń i — gdy wykryto co najmniej 0,5 s mowy — znormalizowany embedding.

Serwis nie jest publikowany na porcie hosta. Jest osiągalny wyłącznie z sieci Compose jako `http://speaker-service:8091`. Compose ogranicza go do 2 vCPU i 2 GB RAM. Modele są pobierane przy pierwszym uruchomieniu i utrzymywane w wolumenie `speaker-models`.

Obecna klasyfikacja jest obserwacyjna: pierwszy trzysekundowy fragment mowy staje się kotwicą sesji, a kolejne są oznaczane jako ten sam lub inny głos na podstawie podobieństwa kosinusowego. Wynik nie zmienia pamięci, uprawnień ani wykonania narzędzi.
