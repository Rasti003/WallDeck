# Raport testu synchronizacji Google Photos

Data: 2026-09-26  
Środowisko: Windows, Node.js 24.15.0  
Źródło: dedykowany album Google Photos udostępniony przez link (adres pominięty)  
Magazyn tymczasowy: `G:\zedjecia`

## Wynik

| Próba | Elementy zdalne | Pobrane | Pominięte | Błędy |
|---|---:|---:|---:|---:|
| Pierwsza synchronizacja | 119 | 119 | 0 | 0 |
| Druga synchronizacja | 119 | 0 | 119 | 0 |
| Uruchomienie z lokalnego pliku konfiguracyjnego | 119 | 0 | 119 | 0 |

Łączny rozmiar pobranych plików wyniósł 249 642 481 bajtów. Manifest `.walldeck-album.json` zawierał 119 aktywnych wpisów. Nie pozostały żadne pliki tymczasowe `.part`.

Wszystkie 119 pobranych plików zostało otwartych przez dekoder obrazów i miało prawidłowe, niezerowe wymiary. Dla próbnego elementu rozdzielczość pliku była zgodna z metadanymi albumu, co potwierdziło pobranie obrazu w rozdzielczości źródłowej.

## Zakres testu

Potwierdzono:

- rozwiązanie skróconego linku i odczyt publicznego shared albumu bez logowania;
- wydobycie 119 unikalnych identyfikatorów, adresów i wymiarów;
- równoległe pobieranie z ponowieniami;
- atomowy zapis pliku przez rozszerzenie `.part`;
- bezpieczne nazwy plików i brak kolizji dzięki fragmentowi identyfikatora;
- manifest i pomijanie wcześniej pobranych elementów;
- konfigurację poza repozytorium.

Nie testowano jeszcze wykrywania elementu usuniętego z albumu ani automatycznego harmonogramu. Mechanizm zależy od nieudokumentowanego formatu strony Google Photos i może wymagać aktualizacji parsera po zmianach po stronie Google.
