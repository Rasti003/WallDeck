# Praca z repozytorium

## Układ zmian

- kod Androida trafia do `apps/tablet-android`;
- frontend i późniejszy backend panelu trafiają do `apps/web-panel`;
- modele, rysunki, lista elementów i instrukcje montażu trafiają do `hardware/wall-mount`;
- decyzje przekrojowe i dokumentacja systemu trafiają do `docs`.

Każda większa zmiana powinna aktualizować odpowiedni README oraz `docs/roadmap.md`. Zmiany protokołu bridge wymagają aktualizacji dokumentacji obu aplikacji i testu kompatybilności.

## Commity

Preferowany format:

```text
android: krótki opis
web: krótki opis
hardware: krótki opis
docs: krótki opis
```

Przed commitem aplikacji Android uruchom:

```powershell
cd apps/tablet-android
./gradlew.bat assembleDebug testDebugUnitTest lintDebug
```

Nie commituj `local.properties`, kluczy podpisujących, Device Key, plików `.env`, artefaktów buildu ani danych kont widocznych na zrzutach sklepów.
