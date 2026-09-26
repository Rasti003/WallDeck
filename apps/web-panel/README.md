# WallDeck Web

To początek aplikacji WWW wyświetlanej przez WebView. Obecnie zawiera stronę diagnostyczną, która testuje Android Bridge. Docelowy interfejs, backend oraz integracje nie są jeszcze zaimplementowane.

Przyjęty stack i etapy implementacji opisuje [plan architektury](../../docs/web-architecture-plan.md): React 19, TypeScript, Vite, Motion, XState, Fastify, SQLite i Docker Compose.

## Uruchomienie prototypu

```powershell
./run.ps1
```

Serwer nasłuchuje wyłącznie na `127.0.0.1:8080`. Dla tabletu połączonego przez ADB:

```powershell
adb reverse tcp:8080 tcp:8080
```

W konfiguratorze APK ustaw `http://127.0.0.1:8080`. Przy tym trybie Device Key może być używany wyłącznie do testów, ponieważ właściwy system powinien działać przez HTTPS.

## Kontrakt

`wallpanel.js` udostępnia `WallPanel.call(method, args)`. Eventy natywne są emitowane jako `wallpanel:powerConnected`, `wallpanel:powerDisconnected` i `wallpanel:batteryChanged`.

Zmiany kontraktu muszą pozostać zgodne z `bridgeVersion` i zostać opisane również w dokumentacji aplikacji Android.

## Synchronizacja udostępnionego albumu Google Photos

Prototyp synchronizatora odczytuje publicznie udostępniony album, pobiera nowe zdjęcia do lokalnego magazynu i zapisuje manifest `.walldeck-album.json`. Link albumu jest kluczem dostępu — trzymaj go w lokalnym pliku konfiguracyjnym i nie dodawaj do repozytorium.

```powershell
Copy-Item photo-sync.config.example.json photo-sync.config.json
# Uzupełnij albumUrl i storagePath.
node tools/sync-google-photos.mjs --config photo-sync.config.json
```

Można też przekazać ustawienia bezpośrednio:

```powershell
node tools/sync-google-photos.mjs --album-url "https://photos.app.goo.gl/..." --storage "G:\zedjecia"
```

Kolejne uruchomienia pomijają istniejące pliki. Element usunięty z albumu jest oznaczany w manifeście jako nieaktywny, ale lokalny plik nie jest automatycznie kasowany. Mechanizm wykorzystuje nieudokumentowany format strony udostępnionego albumu, dlatego parser jest izolowany w adapterze i może wymagać aktualizacji po zmianach Google Photos.

Wyniki pierwszej synchronizacji znajdują się w [raporcie testu](PHOTO_SYNC_TEST_REPORT.md).
