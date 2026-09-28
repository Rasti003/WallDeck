# WallDeck

WallDeck to domowy panel ścienny oparty na tablecie. Repozytorium łączy trzy części jednego produktu:

| Część | Katalog | Stan |
|---|---|---|
| Uchwyt ścienny i zasilanie | [`hardware/wall-mount`](hardware/wall-mount) | specyfikacja i lista elementów |
| Cienka aplikacja na tablet | [`apps/tablet-android`](apps/tablet-android) | działający prototyp 0.1 przetestowany na Xiaomi/Android 16 |
| Panel WWW z homelabu | [`apps/web-panel`](apps/web-panel) | album zdjęć, panel administratora i integracja Home Assistant |

## Założenie

```text
tablet Android
├── WallDeck APK: dostęp do sprzętu, cykl dock/undock i bezpieczny bridge
└── WebView
    └── WallDeck Web: interfejs, automatyka i przyszłe moduły usług

homelab
└── serwer WWW/API, sesje urządzeń i logika integracji
```

APK pozostaje cienką warstwą sprzętową. Interfejs rozwijamy jako aplikację WWW hostowaną w homelabie. Dzięki temu wygląd i logikę panelu można aktualizować bez publikowania nowej wersji APK.

## Dokumentacja

- [Architektura systemu](docs/architecture.md)
- [Architektura i stack panelu WWW](docs/web-architecture-plan.md)
- [Bezpieczeństwo](docs/security.md)
- [Plan rozwoju](docs/roadmap.md)
- [Wdrożenie na serwerze](docs/deployment.md)
- [Serwer MCP dla asystenta](docs/mcp.md)
- [Zasady pracy z repozytorium](CONTRIBUTING.md)
- [Raport testów aplikacji Android](apps/tablet-android/TEST_REPORT.md)

## Aktualny prototyp

Aplikacja Android obsługuje konfigurowalny URL, Device ID i Device Key, szyfrowany storage, bridge ograniczony do zaufanego originu, informacje o urządzeniu, baterię, jasność okna, głośność, keep-awake, haptics, przeładowanie oraz zdarzenia zasilania. Po podłączeniu zasilania może wejść na pierwszy plan, a po odłączeniu zamyka Activity i odsłania poprzednią aplikację, na ile pozwala Android/HyperOS.

Panel WWW obsługuje obecnie album zdjęć, pogodę, jasność per widok oraz centralną integrację Home Assistant. Konfiguracja HA odbywa się w `/admin`; token jest szyfrowany na serwerze i nie wraca do klienta. Administrator może dodać do overlayu dowolne encje HA, nadać im etykiety i przypisać do sześciu stref ekranu. Ich wartości aktualizują się w czasie rzeczywistym, a pełny dashboard jest dostępny jako widok `/ha`.

Serwer WWW udostępnia chroniony tokenem endpoint MCP z małym zestawem funkcji panelu. Każde narzędzie można osobno wyłączyć w sekcji **MCP · AI** panelu administratora. Połączenie z modelem OpenAI i moduły głosowe są kolejnym etapem.

Music ma pierwszy adapter Spotify App Remote, widok odtwarzania i konfigurację w adminie. Wymaga Client ID i autoryzacji na tablecie; test rzeczywistego playbacku/BT pozostaje do wykonania. Wake word i YouTube mają wyłącznie kontrakty rozszerzeń.
