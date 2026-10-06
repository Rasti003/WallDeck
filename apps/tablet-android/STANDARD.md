# WallDeck Standard — instalacja bez Device Ownera

Wersja alternatywna dla Androida 9 lub nowszego. Główną wersją projektu pozostaje WallDeck z zarządzanym kioskiem.

## Instalacja

1. Przenieś plik WallDeck-Standard-0.1.0-debug.apk na tablet i otwórz go.
2. Jeżeli Android poprosi, zezwól wybranej aplikacji na instalowanie APK.
3. Otwórz **WallDeck Standard**. Nie trzeba używać ADB, resetować tabletu ani nadawać uprawnień administratora.
4. W konfiguratorze wpisz adres własnego serwera, np. http://ADRES-SERWERA:8080/panel. Tablet musi mieć dostęp do tej samej sieci. Sam APK nie zastępuje serwera WallDeck.
5. Ustaw osobny Device ID, jeżeli podłączasz kilka tabletów. Device Key w obecnym prototypie LAN pozostaw pusty.
6. Zapisz. Zgody na mikrofon i ewentualnie kamerę nadaj przy korzystaniu z tych funkcji.

Konfigurator można ponownie otworzyć siedmioma szybkimi dotknięciami lewego górnego rogu.

## Zwykłe działanie

Panel działa na pełnym ekranie, ale można normalnie użyć Home, Wstecz i ostatnich aplikacji. Standard nie blokuje systemu i nie wraca sam po ręcznym zamknięciu. Głos działa w aktywnym panelu.

Monitor podłączenia/odłączenia zasilania jest domyślnie wyłączony. Jeśli go włączysz:

- odłączenie zasilania zamyka panel;
- podłączenie daje powiadomienie umożliwiające otwarcie;
- opcjonalna zgoda „Zezwól na powrót panelu z tła” pozwala aplikacji próbować otwierać się automatycznie;
- na Androidzie 13+ włącz powiadomienia monitora;
- automatyczne otwieranie nadal zależy od Androida i ustawień producenta;
- po restarcie tabletu lub wymuszonym zatrzymaniu uruchom aplikację ponownie.

## Osobna instalacja i Spotify

Standard ma osobną ikonę, ustawienia oraz zgody i nie nadpisuje głównego WallDeck. Nie utrzymuj obu paneli głosowych aktywnych równocześnie.

W konfiguracji aplikacji Spotify trzeba dodać pakiet pl.home.wallpanel.standard oraz SHA-1 certyfikatu używanego APK. Redirect URI pozostaje walldeck://spotify-callback. Sama rejestracja pakietu głównego pl.home.wallpanel nie obejmuje Standard.

## Status wydania

To podpisany build **debug do testów**, nie finalne wydanie release. Testy kompilacji nie zastępują sprawdzenia mikrofonu, muzyki oraz podłączania ładowarki na konkretnym tablecie. Serwer prototypu przeznaczony jest do zaufanej sieci LAN.
