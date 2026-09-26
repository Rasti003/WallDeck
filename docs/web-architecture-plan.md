# Plan architektury WallDeck Web

Status: decyzja architektoniczna do implementacji  
Data: 2026-09-26

## 1. Cel

WallDeck Web ma być głównym interfejsem panelu ściennego. Home Assistant pozostaje backendem automatyki, APK udostępnia funkcje Androida, a cały wygląd, animacje, ramka zdjęć, multimedia i późniejszy asystent działają w aplikacji WWW hostowanej na homelabie.

Plan rozwija założenia zapisane w [Home Assistant Wall Panel — Redmi Pad 2](https://app.notion.com/p/3e3827a850e38106a208c7b5315919e4). Wake word pozostaje świadomie w późniejszym etapie roadmapy.

## 2. Decyzja technologiczna

| Warstwa | Wybór | Uzasadnienie |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite | duży ekosystem, dobra obsługa długowiecznej SPA w WebView, szybki development bez narzutu SSR |
| Animacje | Motion for React + CSS transforms; opcjonalnie Rive | Motion obsługuje animacje layoutu, gesty i sekwencje; Rive nadaje się do złożonych animacji stanowych asystenta |
| Maszyna trybów | XState | jawne i testowalne przejścia `IDLE`, `ACTIVE`, `MEDIA`, później `ASSISTANT` |
| Dane frontendowe | TanStack Query + cienki klient WebSocket | cache zapytań i odporne odświeżanie danych; zdarzenia HA i urządzenia bez pollingu |
| UI | CSS Modules, CSS custom properties, Radix primitives | własny wygląd bez ciężkiego gotowego dashboardu; dostępne komponenty bazowe |
| Backend | Node.js LTS + TypeScript + Fastify | jeden język dla całego systemu, niewielki narzut i proste API/WebSocket/OAuth |
| Kontrakty | Zod + współdzielone typy TypeScript | walidacja każdej wiadomości na granicy procesu i zgodność klient–serwer |
| Baza | SQLite + Drizzle ORM | wystarczające dla jednego homelabu, prosty backup i migracje bez osobnej usługi |
| Obrazy | Sharp + lokalny magazyn plików | generowanie rozmiarów pod tablet, korekta orientacji i szybkie lokalne odtwarzanie |
| Testy | Vitest + Testing Library + Playwright | logika jednostkowa, komponenty oraz pełne scenariusze trybów i WebView |
| Uruchomienie | Docker Compose + Caddy | powtarzalny deployment i HTTPS za reverse proxy |

Nie wybieramy Next.js ani innego frameworka SSR. Panel nie potrzebuje SEO, a podstawowym klientem jest jeden WebView. Zwykła SPA jest prostsza, mniejsza i łatwiejsza do utrzymania offline.

## 3. Docelowy układ repozytorium

```text
apps/web-panel/
├── apps/
│   ├── client/                 React/Vite — panel i panel administracyjny
│   └── server/                 Fastify — API, WebSocket i integracje
├── packages/
│   ├── contracts/              schematy Zod i wersjonowany protokół
│   ├── ui/                     design tokens i wspólne komponenty
│   └── integrations/           typy adapterów HA, Photos i Android
├── storage/                    ignorowane dane runtime
├── docker-compose.yml
└── README.md
```

Monorepo użyje `pnpm workspaces`. Nie dokładamy Turborepo na początku; liczba pakietów nie uzasadnia jeszcze dodatkowej warstwy.

## 4. Architektura wykonawcza

```mermaid
flowchart LR
  Tablet["Tablet / WallDeck APK"] -->|"HTTPS + WSS"| Server["WallDeck Server"]
  Browser["Telefon lub komputer / Admin"] -->|"HTTPS"| Server
  Server -->|"WebSocket + REST"| HA["Home Assistant"]
  Server -->|"OAuth 2.0 + Picker API"| Photos["Google Photos"]
  Server --> DB["SQLite"]
  Server --> Media["Lokalny magazyn zdjęć i miniaturek"]
  Tablet <-->|"WallPanelNative"| Android["Android Bridge"]
```

Frontend nie łączy się bezpośrednio z Home Assistant ani Google. Wszystkie tokeny i reguły dostępu pozostają na serwerze. Tablet otrzymuje tylko dane potrzebne do aktualnego widoku.

### Procesy

**Client** jest jedną aplikacją z dwoma powłokami:

- `/panel` — pełnoekranowy interfejs tabletu;
- `/admin` — konfiguracja dostępna z normalnej przeglądarki na telefonie lub komputerze.

**Server** zapewnia:

- uwierzytelnienie urządzenia przez Device ID + podpis challenge;
- sesję panelu w Secure/HttpOnly cookie;
- adapter Home Assistant;
- adapter Google Photos Picker;
- katalog zdjęć i generowanie wariantów;
- konfigurację trybów, ekranów i urządzeń;
- wersjonowany WebSocket;
- healthcheck, logi i migracje bazy.

## 5. Model stanu interfejsu

Centralna maszyna XState zarządza trybami, zamiast rozrzucać warunki po komponentach:

```text
BOOT
├── CONNECTING
├── ON_WALL_IDLE       zdjęcia, zegar, pogoda, wybrane sensory
├── ON_WALL_ACTIVE     sterowanie domem i szybkie akcje
├── MEDIA              YouTube / Spotify w późniejszym etapie
├── ASSISTANT          późniejszy etap wake word
├── OFFLINE            ostatni stan i dane z cache
└── ERROR              kontrolowany ekran diagnostyczny
```

`OFF_WALL` pozostaje przede wszystkim stanem natywnej aplikacji Android: Activity zostaje zakończone i tablet wraca do poprzedniej aplikacji. WebPanel może otrzymać `powerDisconnected` do zapisania ostatniego stanu, ale nie może polegać na tym, że zdąży wykonać dłuższą operację.

Źródła przejść:

- eventy Android Bridge: zasilanie, bateria, później czujniki;
- zdarzenia Home Assistant: obecność/mmWave, alarm, dzwonek i stan domu;
- dotyk oraz bezczynność użytkownika;
- harmonogram dnia/nocy;
- później wake word i odtwarzanie multimediów.

## 6. Strategia animacji

Animacje są elementem produktu, ale muszą utrzymywać 60 fps na docelowym tablecie.

### Zasady

- animujemy głównie `transform` i `opacity`;
- unikamy ciągłych animacji dużych blurów, cieni i filtrów;
- zdjęcia są dekodowane i skalowane na serwerze do rozdzielczości tabletu;
- każda zmiana trybu ma jedną koordynowaną sekwencję, sterowaną stanem;
- przerywane przejścia zaczynają się od aktualnej pozycji, bez skoków;
- po dłuższej bezczynności zmniejszamy częstotliwość animacji i liczbę warstw;
- respektujemy `prefers-reduced-motion`, również jako ręczne ustawienie panelu;
- mierzymy frame time, pamięć WebView i czas dekodowania obrazów na fizycznym tablecie.

### Podział narzędzi

- **CSS transitions/keyframes** — puls, halo, proste stany przycisków;
- **Motion** — przejścia ekranów, layout, gesty, spring i shared element transitions;
- **Rive** — opcjonalnie pojedyncza złożona animacja asystenta lub statusu, jeśli statyczne SVG + Motion nie wystarczą;
- **Canvas/WebGL** — tylko dla konkretnego efektu po pomiarze wydajności, nie jako fundament całego UI.

Pierwszy budżet wydajnościowy: brak długich zadań powyżej 50 ms podczas normalnego działania, stabilne 60 fps w przejściach, ograniczony preloading do bieżącego i następnego zdjęcia oraz brak nieograniczonego wzrostu pamięci po 24 godzinach.

## 7. Google Photos

### Ograniczenie platformy

Po zmianach Google Photos obowiązujących od 31 marca 2025 aplikacja nie może stale listować całej prywatnej biblioteki ani dowolnego istniejącego albumu. Library API widzi zasadniczo dane utworzone przez daną aplikację. Do zdjęć użytkownika należy użyć Google Photos Picker API, w którym użytkownik świadomie wskazuje konkretne materiały.

### Proponowany przepływ

1. Użytkownik otwiera `/admin` na telefonie lub komputerze.
2. WallDeck pokazuje jasną informację, które zdjęcia pobierze, do czego ich użyje i jak je usunąć.
3. Backend rozpoczyna OAuth 2.0 z minimalnym zakresem `photospicker.mediaitems.readonly`.
4. Backend tworzy sesję Picker i zwraca `pickerUri`.
5. Link otwiera się w nowej karcie; Picker nie może działać w iframe.
6. Backend odpytuje sesję zgodnie z przekazanym `pollInterval` i `timeoutIn`.
7. Po zatwierdzeniu pobiera wybrane pozycje oraz warianty potrzebne panelowi.
8. WallDeck tworzy lokalny katalog zdjęć, miniatury i metadane widoczne w `/admin`.
9. Użytkownik może usunąć pojedyncze zdjęcie, całą kolekcję oraz połączenie Google.

Adresy `baseUrl` Google wygasają po około 60 minutach i wymagają tokenu OAuth. Tablet nie powinien korzystać z nich bezpośrednio. Serwer musi traktować Picker jako kontrolowany import wybranej kolekcji i stosować jasną retencję, usuwanie na żądanie oraz szyfrowanie tokenów. Przed implementacją trzeba ponownie potwierdzić zgodność czasu przechowywania lokalnych kopii z aktualną polityką Photos API.

Jeżeli wymaganiem stanie się automatyczna synchronizacja zmieniającego się albumu bez ponownego wyboru, oficjalne Google Photos API tego obecnie nie zapewnia. Wtedy lepszym źródłem będzie wskazany folder Google Drive, lokalny katalog synchronizowany do homelabu albo Immich. Adapter zdjęć powinien więc od początku mieć interfejs `PhotoSource`, aby później dodać inne źródło bez przebudowy ramki.

## 8. Home Assistant

WallDeck Server utrzymuje jedno połączenie z `/api/websocket`, subskrybuje tylko potrzebne encje i publikuje do klientów znormalizowane zmiany. REST służy do wybranych operacji i diagnostyki. Długotrwały token HA pozostaje wyłącznie na serwerze.

Konfiguracja mapuje encje HA na semantyczne nazwy WallDeck:

```yaml
rooms:
  salon:
    temperature: sensor.salon_temperature
    presence: binary_sensor.salon_presence
    lights:
      - light.salon_main
```

Frontend nie powinien znać przypadkowych `entity_id` w komponentach. Adapter tłumaczy stan HA na kontrakty `RoomState`, `ClimateState`, `LightState` i `HomeStatus`. Dzięki temu zmiana integracji HA nie wymaga przebudowy UI.

## 9. Protokół klient–serwer

WebSocket ma jawne wersjonowanie i schematy Zod:

```text
client.hello
server.snapshot
server.patch
server.modeHint
client.command
server.commandResult
server.error
```

Po ponownym połączeniu klient wysyła ostatni numer rewizji. Serwer zwraca brakujące zmiany albo pełny snapshot. Komendy mają correlation ID, timeout, walidację i idempotency key tam, gdzie powtórzenie mogłoby zmienić urządzenie drugi raz.

## 10. Offline i odporność

- service worker przechowuje wersjonowany app shell;
- IndexedDB przechowuje ostatni poprawny snapshot, ustawienia wizualne oraz kolejkę bezpiecznych akcji UI;
- lokalny magazyn serwera udostępnia przygotowane zdjęcia bez połączenia z Google;
- ekran offline nadal pokazuje zegar, ostatnie zdjęcia i stan połączenia;
- komendy do domu nie są udawane jako wykonane; UI pokazuje stan oczekujący i wynik serwera;
- klient stosuje backoff z jitterem i wraca po WebSocket bez przeładowania całego WebView;
- backend ma `/health/live` i `/health/ready` oraz automatyczne migracje przed startem.

## 11. Bezpieczeństwo

- wyłącznie HTTPS/WSS poza tunelem developerskim localhost;
- Device Key i tokeny OAuth nigdy nie trafiają do JavaScriptu ani repozytorium;
- refresh token Google i token Home Assistant są szyfrowane na serwerze;
- sesje panelu są przypisane do Device ID, krótkie i odnawialne;
- panel Android otrzymuje minimalny zakres API, a `/admin` wymaga osobnej sesji użytkownika;
- restrykcyjny CSP, brak skryptów z przypadkowych CDN i zależności przypięte lockfile;
- proxy zdjęć nie przyjmuje dowolnego URL, tylko znane identyfikatory katalogu;
- wszystkie komendy HA przechodzą przez allowlistę domen, usług i encji;
- logi nie zawierają tokenów, Device Key ani adresów zdjęć Google.

## 12. Obserwowalność i testy

### Automatyczne

- testy maszyny stanów dla wszystkich przejść i przerwań animacji;
- testy kontraktów Zod oraz zgodności wersji bridge;
- testy adaptera HA na nagranych, zanonimizowanych komunikatach;
- testy OAuth/Picker na stubie bez prawdziwych tokenów;
- Playwright dla `/panel` i `/admin` w rozdzielczości 1280 × 2048 oraz w orientacji poziomej;
- wizualne snapshoty kluczowych ekranów;
- test 24-godzinny pod kątem pamięci, reconnectów i rotacji zdjęć.

### Na tablecie

- stabilność 60 fps i brak thermal throttlingu;
- przejście idle ↔ active po obecności i dotyku;
- utrata homelabu, HA i internetu jako trzy osobne scenariusze;
- restart serwera bez restartu APK;
- dock/undock podczas animacji i odtwarzania zdjęcia;
- działanie po wygaszeniu oraz ponownym włączeniu ekranu.

## 13. Etapy implementacji

### Etap 1 — fundament

- [ ] przenieść obecną stronę diagnostyczną do `apps/client`;
- [ ] utworzyć Fastify server i współdzielony pakiet kontraktów;
- [ ] dodać Docker Compose, Caddy i konfigurację środowiskową;
- [ ] zaimplementować challenge/session dla urządzenia;
- [ ] połączyć Android Bridge z warstwą adaptera frontendowego.

### Etap 2 — panel bazowy

- [ ] utworzyć design tokens i shell 1280 × 2048;
- [ ] wdrożyć XState dla `BOOT`, `IDLE`, `ACTIVE`, `OFFLINE`;
- [ ] zbudować zegar, pogodę, status domu i szybkie akcje;
- [ ] dodać podstawowe przejścia Motion oraz profil reduced motion.

### Etap 3 — Home Assistant

- [ ] adapter WebSocket/REST po stronie serwera;
- [ ] mapowanie encji do modelu domenowego;
- [ ] reconnect, snapshot/patch i potwierdzenia komend;
- [ ] ekran diagnostyczny integracji.

### Etap 4 — ramka zdjęć

- [ ] interfejs `PhotoSource` i lokalny katalog;
- [ ] `/admin` z Google OAuth oraz Photos Picker;
- [ ] import, generowanie wariantów, kolejka i usuwanie;
- [ ] animowane przejścia zdjęć i harmonogram dzień/noc;
- [ ] polityka prywatności i ekran zarządzania danymi.

### Etap 5 — presence i dopracowanie

- [ ] mmWave lub inne źródło obecności przez HA;
- [ ] automatyczne idle ↔ active;
- [ ] ambient LED jako zsynchronizowane zdarzenia UI/HA;
- [ ] test 24-godzinny i optymalizacja GPU/RAM.

### Etap późniejszy

- [ ] YouTube, Spotify i audio routing;
- [ ] `AssistantService`, mikrofon, lokalny wake word i VAD;
- [ ] STT/LLM/TTS na homelabie;
- [ ] animowany widok asystenta.

## 14. Otwarte decyzje przed implementacją

1. Jaka domena HTTPS i mechanizm certyfikatu będą używane w LAN?
2. Czy panel administracyjny będzie dostępny tylko w LAN, czy także przez VPN?
3. Jak długo WallDeck może przechowywać lokalnie zdjęcia świadomie wybrane przez Picker?
4. Czy ramka ma obsługiwać wideo i Motion Photos w pierwszej wersji?
5. Które encje HA tworzą pierwszy ekran i szybkie akcje?
6. Czy obecność będzie od początku pochodzić z mmWave przez HA, czy pierwsza wersja użyje czasu bezczynności i dotyku?

## 15. Źródła

- [Założenia WallDeck w Notion](https://app.notion.com/p/3e3827a850e38106a208c7b5315919e4)
- [Google Photos API updates](https://developers.google.com/photos/support/updates)
- [Google Photos Picker sessions](https://developers.google.com/photos/picker/guides/sessions)
- [Google Photos media items i ważność URL](https://developers.google.com/photos/picker/guides/media-items)
- [Google Photos API policy](https://developers.google.com/photos/support/api-policy)
- [Home Assistant WebSocket API](https://developers.home-assistant.io/docs/api/websocket/)
- [Home Assistant REST API](https://developers.home-assistant.io/docs/api/rest/)
- [Motion for React](https://motion.dev/docs/react)
