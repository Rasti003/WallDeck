# Bezpieczeństwo

## Granica zaufania

Android Bridge jest dodawany tylko dla dokładnego originu skonfigurowanego panelu i przyjmuje wiadomości wyłącznie z głównej ramki. Nawigacja głównej ramki poza origin jest blokowana. Obcy origin i iframe nie otrzymują odpowiedzi bridge.

WebView ma wyłączony dostęp do `file:` i `content:`, third-party cookies, mieszane treści i automatyczne okna. Błędy certyfikatu TLS kończą połączenie. Mikrofon oraz kamera nie są obecnie udostępniane.

## Sekrety

Konfiguracja jest szyfrowana AES-256-GCM. Klucz szyfrujący jest generowany w Android Keystore, a zaszyfrowane dane trafiają do DataStore. Backup i transfer danych aplikacji są wyłączone. Device Key:

- nie trafia do URL;
- nie jest zwracany do JavaScriptu;
- nie jest logowany;
- może być użyty przez bridge tylko do podpisania prawidłowego wyzwania;
- wymaga HTTPS albo tunelu ADB do localhost podczas developmentu.

Repozytorium nie może zawierać rzeczywistych Device Key, kluczy podpisujących APK, cookies, haseł, linków dających dostęp do prywatnych albumów ani prywatnych plików `.env`/`photo-sync.config.json`.

Klucze OpenAI i ElevenLabs są przechowywane w osobnych zaszyfrowanych plikach runtime przez `EncryptedSecretStore`. API konfiguracji przyjmuje nowy klucz, ale status zwraca wyłącznie informację, czy został zapisany. Klucz ElevenLabs jest wysyłany do dostawcy tylko w nagłówku `xi-api-key`; nie trafia do URL, ustawień publicznych, WebView ani repozytorium. Endpoint listy głosów usuwa adresy próbek i pozostałe metadane konta.

Historia asystenta przechowuje lokalnie maksymalnie 100 tekstowych tur, aby administrator mógł zweryfikować transkrypcję, wejście modelu i działania MCP. Może zawierać prywatną treść wypowiedzi oraz wyniki narzędzi, dlatego pozostaje w katalogu runtime, nie trafia do logów ani repozytorium i ma przycisk trwałego wyczyszczenia. Nie zawiera surowego audio ani kluczy dostawców.

Minutniki i budziki są zapisywane wyłącznie w prywatnym runtime `schedules.json` z trybem pliku `0600`. Rekord może zawierać etykietę, prompt automatyzacji i skrócony wynik asystenta, więc plik podlega tej samej ochronie co historia rozmów i nie trafia do repozytorium. Prompt jest uruchamiany przez istniejący `AssistantService`; jego możliwości nadal ograniczają przełączniki wspólnego rejestru narzędzi. API waliduje długość tekstu, terminy, dni tygodnia i zakres drzemki.

Udostępniony link Google Photos traktujemy jak sekret o ograniczonym zakresie. Jest przechowywany tylko w konfiguracji serwera, nie trafia do klienta WebView ani logów. Album powinien służyć wyłącznie WallDeckowi; unieważnienie linku w Google Photos odcina synchronizator.

## Odpowiedzialność panelu WWW

### Spotify App Remote

Bridge v3 zachowuje allowlist originu i kontrolę głównej ramki. Późne odpowiedzi komend są dostarczane wyłącznie do bieżącego dokumentu/odbiornika. Web może przekazać publiczny 32-znakowy Client ID, nigdy Client Secret. Redirect URI jest stały: `walldeck://spotify-callback`. SDK i Spotify zarządzają autoryzacją; tokeny nie są zwracane do JS ani zapisywane w konfiguracji serwera.

Komendy mają allowlist, walidowany zakres seek/repeat i wyłącznie URI Spotify o określonym typie. Nie ma arbitralnych intentów, adresów ani wykonywania komend systemowych. Nazwy utworów i urządzeń renderuje React jako tekst. Metadane konta/artwork pozostają w pamięci tabletu. SDK pobieramy z oficjalnego przypiętego release z kontrolą SHA-256; AAR jest ignorowany przez Git. Nie dodano uprawnień Bluetooth, mikrofonu ani odczytu powiadomień.

Jasność per mimika używa istniejącego zaufanego bridge i dotyczy wyłącznie okna WallDeck. Nie zapisuje globalnej jasności systemu ani nie wymaga nowych uprawnień. Backend waliduje nazwy min oraz zakres 5–100%; fallback -1 jest wyliczany w kliencie jako powrót do ustawień Androida.

Rozmowa głosowa wymaga uprawnienia Android `RECORD_AUDIO`. Wake word korzysta wyłącznie z lokalnego Vosk; model jest pobierany z oficjalnego źródła po HTTPS i akceptowany tylko po zgodności rozmiaru oraz przypiętej sumy SHA-256. Po lokalnym wykryciu frazy wybrany tryb otwiera GPT-Live albo buforuje jedną turę dla transkrypcji i Luny. Surowy PCM przechodzi przez zaufany bridge i serwer WallDeck do OpenAI, ale nie jest zapisywany w runtime ani logach. W trybie Luna model transkrypcji otrzymuje całe ograniczone czasowo polecenie, a agent tekstowy dostaje wyłącznie transkrypcję. Klucz pozostaje w szyfrowanym storage serwera i nigdy nie trafia do WebView. Oba endpointy WebSocket sprawdzają zgodność Origin/Host, dopuszczają jedną sesję danego toru i mają twardy limit czasu wejścia lub sesji. Obecny prototyp nadal wymaga zaufanej sieci LAN; docelowo transport panel–serwer wymaga HTTPS/WSS i sesji urządzenia.

Eksperymentalna obserwacja mówcy działa na homelabie. PCM bieżącej rozmowy trafia równolegle tylko do niepublikowanego portu `speaker-service` w prywatnej sieci Compose. Silero VAD i ECAPA-TDNN nie zapisują audio ani embeddingów; kotwica i porównania istnieją wyłącznie w pamięci do zamknięcia sesji. W GPT-Live wynik pozostaje telemetrią. W trybie Luna pomaga wyznaczyć koniec tury, lecz nie zmienia treści, dostępnych narzędzi ani uprawnień. Do panelu trafia anonimowa etykieta, pewność, relacja i czas przetwarzania. Wynik nie uwierzytelnia użytkownika, nie ładuje pamięci i nie rozszerza uprawnień. Funkcję można wyłączyć w adminie. Stary klaster cech APK pozostaje zgodny z bridge, ale klient nie włącza go podczas nowych rozmów.

Wszystkie skrypty uruchamiane przez zaufany origin mają dostęp do bridge. Backend i frontend muszą więc zapobiegać XSS, stosować restrykcyjny CSP, aktualizować zależności oraz wydawać krótkie sesje. Weryfikacja HMAC powinna być stałoczasowa, a każde wyzwanie jednorazowe i szybko wygasające.

Zgodne wstecz rozszerzenia bridge v1 przekazują do zaufanej głównej ramki jedynie rodzaj interakcji: `userInteraction` wysyła `{kind: "touch"}`, a `swipeDown` wysyła `{kind: "swipeDown"}`. Nie przekazują współrzędnych ani treści z HA i nie udostępniają bridge osadzonemu dashboardowi. Komunikat `panel.activity` nie przenosi sekretów; obecne API prototypu pozostaje dostępne w LAN, a sesje urządzeń wymagają osobnego wdrożenia.

Raport diagnostyczny urządzenia zawiera identyfikator panelu, model, wersje, stan baterii, status uprawnień i publiczne metadane sensorów. Nie zawiera Device Key, tokenów, danych konta ani treści z Home Assistant. Raport jest walidowany wspólnym schematem, ma limit 64 KiB i pozostaje tylko w pamięci procesu serwera. Dostęp do `/api/devices` podlega tym samym ograniczeniom sieciowym co obecny prototyp panelu admina.

Zdarzenie `ambientLightChanged` zawiera wyłącznie liczbę lux. Nie uruchamia kamery, nie zapisuje historii pomiarów i jest dostępne tylko zaufanej głównej ramce na zasadach pozostałych eventów bridge.

Reguła nocy oparta na Home Assistant pobiera z backendu wyłącznie publiczne metadane i bieżący stan jednej skonfigurowanej encji. Token HA pozostaje w zaszyfrowanej konfiguracji serwera. Identyfikator encji przechodzi walidację, a klient nie zapisuje historii jej wartości. Zmiana źródła na HA wyłącza natywne próbkowanie kamery.

Fallback kamerowy wymaga jawnego uprawnienia Androida i można go wyłączyć w `/admin`. Surowe klatki pozostają w pamięci APK tylko podczas obliczania średniej luminancji: nie są zapisywane, przesyłane do WebView ani wysyłane na serwer. Bridge przekazuje jedynie liczbę `brightnessPercent`. Kamera jest zamykana po trzeciej klatce, po wyłączeniu ustawienia i po przejściu aplikacji w tło. Android może pokazywać systemowy wskaźnik prywatności podczas krótkiego pomiaru.

Immersive fullscreen ogranicza przypadkowe wejście do interfejsu systemowego, ale nie stanowi zabezpieczenia kiosku. Android może przejściowo odsłonić paski gestem z krawędzi. Pełna blokada panelu powiadomień wymaga kontrolowanego wdrożenia Device Owner i lock task.

Diagnostyka Spotify przekazuje wyłącznie ograniczoną nazwę klasy błędu SDK; nie przekazuje surowej treści wyjątku. Frontend mapuje ją na wskazówki autoryzacji i połączenia.

Autoryzacja Spotify na API 34+ używa BIND_ALLOW_ACTIVITY_STARTS wyłącznie przy authorize=true i bindzie do com.spotify.music z akcją App Remote. To jawne udostępnienie systemowej możliwości otwarcia okna zgody przez powiązaną usługę, gdy WallDeck jest widoczny. Nie dotyczy innych usług, nie nadaje uprawnień konta ani nie zatwierdza zgody za użytkownika.

WallDeckAdminReceiver is exported only behind android.permission.BIND_DEVICE_ADMIN; its policy list is empty. Device Owner is a broad management role and requires deliberate provisioning. The attempted registration was refused by Android due to existing accounts; no owner or active admin remained. Do not remove accounts or reset the device as an automatic workaround.

Provisioning update: user removed remaining accounts; a subsequent authorized ADB registration succeeded. WallDeck now holds Device Owner on the physical test tablet. No kiosk policies have been applied. Earlier failed-attempt reports above describe the previous state.

Managed kiosk allowlists WallDeck and Spotify only and sets LOCK_TASK_FEATURE_NONE. Device Owner persists after exiting kiosk. Native tablet-mode exit and Volume Down hold intentionally permit local escape: this is a household panel, not tamper-proof public signage. No keyguard disable or account restrictions are applied. Kiosk waits until keyguard is unlocked.

During managed kiosk, DISALLOW_CREATE_WINDOWS blocks additional non-application windows. The restriction is cleared on explicit exit and lock-task-exit callback. This is distinct from manufacturer task windowing; Xiaomi gesture behavior still requires physical confirmation.

OEM toolbar closure recovery intentionally excludes manual tablet mode and hardware emergency exits. No system packages or HyperOS features were disabled globally.

REORDER_TASKS added for recovery of the existing WallDeck task after OEM hide. Recovery is limited to an active docked lock-task session; no polling of other app content.

exitToTablet is deliberately exposed only through the existing trusted main-frame bridge. It uses the same native manual-exit suppression and policy cleanup; no new origin or permission was added.
# Galeria i synchronizacja — 2026-09-28

API zdjęć nie ujawnia sourceUrl/resolvedUrl manifestu ani ścieżek hosta. Źródło jest czytane wyłącznie z lokalnego manifestu; endpoint synchronizacji nie przyjmuje zdalnego URL. Błędy synchronizacji zwracane do klienta są ogólne, bez prywatnego linku. Nazwy plików są ograniczone do katalogu zdjęć, parametry kadru waliduje Zod. Miniatury i korekty pozostają w prywatnym runtime; trzeba uwzględnić korekty w kopii zapasowej.

Istniejący prototyp API nadal zakłada zaufaną sieć LAN; funkcje admina nie są osobno uwierzytelnione. Nie wystawiać portu serwera publicznie. Nie zmieniono uprawnień Android Bridge.
# Metadane zdjęć — 2026-09-28

Odczyt EXIF/IPTC/XMP odbywa się lokalnie na serwerze. Endpoint metadanych zwraca tylko datę wykonania i podpis miejsca (lub zaokrąglone współrzędne), bez pełnego EXIF, numerów seryjnych aparatu i prywatnego źródła albumu. Brak wysyłania GPS do usług zewnętrznych. Podpis renderowany jako tekst React, bez HTML.
