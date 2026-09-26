# WallDeck Web

Aplikacja WWW panelu ściennego. Pierwszy widok prezentuje lokalną kopię albumu zdjęć i automatycznie dopasowuje układ do orientacji ekranu oraz fotografii.

## Dostępne ekrany

- `/panel` — pełnoekranowy widok dla aplikacji tabletowej;
- `/admin` — osobny panel ustawień otwierany z telefonu lub komputera. WallPanel nie pokazuje prowadzącego do niego odnośnika.

Na ekranie poziomym aplikacja losowo pokazuje jedno zdjęcie poziome albo parę zdjęć pionowych. Na ekranie pionowym reguła działa odwrotnie. Następny zestaw jest ładowany z wyprzedzeniem, a ostatnio pokazane zdjęcia są pomijane, gdy istnieją inne pasujące fotografie.

Panel administratora pozwala ustawić czas zmiany i przejścia, położenie overlayu, zegar, datę, pogodę oraz przyszły status Home Assistant. Ustawienia są wysyłane do działającego panelu przez WebSocket bez przeładowania strony.

## Uruchomienie

Wymagane są Node.js 22+ i pnpm 11.

```powershell
./run.ps1 -PhotoStoragePath 'G:\zedjecia'
```

Skrypt instaluje zależności, buduje klienta i serwer, a następnie uruchamia aplikację na porcie `8080`. Inny port można podać przez `-Port`. Po wcześniejszym zbudowaniu aplikacji opcja `-SkipBuild` skraca kolejne uruchomienia.

Adresy w sieci lokalnej:

```text
http://ADRES-SERWERA:8080/panel
http://ADRES-SERWERA:8080/admin
```

Podczas testów przez ADB można użyć:

```powershell
adb reverse tcp:8080 tcp:8080
```

i ustawić w APK adres `http://127.0.0.1:8080/panel`.

## Wywołanie widoku

Backend udostępnia niezależny od UI punkt sterowania:

```http
POST /api/views/activate
Content-Type: application/json

{ "viewId": "photos" }
```

Każdy podłączony panel dostaje zmianę przez WebSocket. Z poziomu klienta dostępny jest także kontrakt `window.WallDeckViews.activate("photos")`. Rejestr widoków pozwala dodawać kolejne ekrany bez przebudowy logiki aktywacji.

## Pogoda

Po wpisaniu współrzędnych w `/admin` serwer pobiera bieżącą pogodę z Open-Meteo i przechowuje wynik przez 10 minut. Klient nie łączy się bezpośrednio z zewnętrzną usługą.

## Synchronizacja Google Photos

Synchronizator odczytuje album udostępniony przez link, pobiera nowe zdjęcia do lokalnego magazynu i zapisuje manifest `.walldeck-album.json`. Link albumu jest kluczem dostępu — trzymaj go w lokalnym pliku konfiguracyjnym i nie dodawaj do repozytorium.

```powershell
Copy-Item photo-sync.config.example.json photo-sync.config.json
# Uzupełnij albumUrl i storagePath.
node tools/sync-google-photos.mjs --config photo-sync.config.json
```

Kolejne uruchomienia pomijają istniejące pliki. Element usunięty z albumu zostaje oznaczony jako nieaktywny, ale lokalny plik nie jest automatycznie kasowany. Mechanizm wykorzystuje nieudokumentowany format strony udostępnionego albumu, dlatego parser jest izolowany w adapterze.

Wyniki pierwszej synchronizacji znajdują się w [raporcie testu](PHOTO_SYNC_TEST_REPORT.md).
