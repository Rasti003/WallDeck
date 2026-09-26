# WallDeck Web

To początek aplikacji WWW wyświetlanej przez WebView. Obecnie zawiera stronę diagnostyczną, która testuje Android Bridge. Docelowy interfejs, backend oraz integracje nie są jeszcze zaimplementowane.

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
