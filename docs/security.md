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

Repozytorium nie może zawierać rzeczywistych Device Key, kluczy podpisujących APK, cookies, haseł ani prywatnych plików `.env`.

## Odpowiedzialność panelu WWW

Wszystkie skrypty uruchamiane przez zaufany origin mają dostęp do bridge. Backend i frontend muszą więc zapobiegać XSS, stosować restrykcyjny CSP, aktualizować zależności oraz wydawać krótkie sesje. Weryfikacja HMAC powinna być stałoczasowa, a każde wyzwanie jednorazowe i szybko wygasające.
