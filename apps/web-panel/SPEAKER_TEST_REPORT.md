# Testy lokalnej obserwacji mówcy

## 2026-10-02 — Silero VAD + ECAPA-TDNN

Środowisko: VM `walldeck`, 4 vCPU AMD Ryzen 5 PRO 2400G, 7,7 GiB RAM. Kontener `speaker-service` ograniczony przez Compose do 2 vCPU i 2 GB RAM; `pyannote.audio` nie jest zainstalowane.

- Budowa obrazu z PyTorch CPU 2.9.1, Silero VAD 6.2.3, SpeechBrain 1.1.1 i ONNX Runtime 1.30.0: PASS.
- Pierwsze pobranie i załadowanie modeli: 6424 ms. Ponowne uruchomienie korzysta z trwałego wolumenu modeli.
- Trzy sekundy zerowego PCM 24 kHz: `speech=false`, 0 s mowy, 66,0 ms przetwarzania. PASS.
- Oficjalna próbka mowy SpeechBrain, po konwersji do mono PCM16 24 kHz: `speech=true`, 3,261 s mowy, embedding ECAPA 192 wymiary, 260,8 ms przetwarzania. PASS.
- Test awarii: po zatrzymaniu `speaker-service` `/api/health` WallDeck nadal zwracał `status=ok`, a status obserwatora zmienił się na `available=false`. Po uruchomieniu kontenera status sam wrócił do `available=true`, `modelReady=true`. PASS.
- Stan spoczynkowy przed optymalizacją obrazu: około 377 MiB RAM. Rozmowa GPT-Live nie była uruchamiana i nie odtwarzano muzyki.
- Po usunięciu zbędnego FFmpeg finalny obraz ma 1 815 451 937 bajtów, proces spoczynkowy zajmuje około 308 MiB RAM, a modele z trwałego cache ładują się w 403 ms. Oba kontenery mają stan `healthy`.
- Fizyczny Xiaomi `2603ARP14G` przeładował produkcyjny `/panel` po wdrożeniu i ponownie zgłosił się jako online. Nie wykonywano jeszcze próby głosowej użytkownika.

Nie wykonano jeszcze testu rozróżniania rzeczywistych domowników ani głosu z telewizora. Próg podobieństwa 0,72 pozostaje eksperymentalny, a wynik nie wpływa na pamięć, uprawnienia ani narzędzia.
