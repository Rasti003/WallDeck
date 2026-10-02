# Wdrożenie WallDeck Web

## Host produkcyjny

Pierwszym hostem jest VM Debian `walldeck` w Proxmox:

- 4 vCPU;
- 8 GB RAM;
- systemowy dysk 24 GB;
- adres LAN przydzielany przez DHCP;
- Docker Engine z Compose;
- aplikacja w `/opt/walldeck`;
- trwałe dane w `/srv/walldeck/runtime`;
- zdjęcia w `/srv/walldeck/photos` do czasu podłączenia docelowego NAS.

Kod aplikacji i obrazy kontenerów są odtwarzalne. Kopii zapasowej wymagają katalogi `/srv/walldeck/runtime` i `/srv/walldeck/photos`. Runtime zawiera ustawienia panelu, zaszyfrowaną konfigurację Home Assistant oraz lokalny klucz szyfrujący. Nie wolno dodawać zawartości tych katalogów ani pliku `.env` do repozytorium.

## Pierwsze uruchomienie

```bash
sudo install -d -o "$USER" -g "$USER" /opt/walldeck /srv/walldeck/runtime /srv/walldeck/photos
git clone https://github.com/Rasti003/WallDeck.git /opt/walldeck/repository
cd /opt/walldeck/repository/apps/web-panel
cp .env.example .env
docker compose up -d --build
docker compose ps
```

Panel będzie dostępny pod adresami:

```text
http://ADRES_VM:8080/panel
http://ADRES_VM:8080/admin
```

## Aktualizacja

Proces kontenera ma UID/GID 10001. Katalogi runtime/zdjęć muszą pozwalać tej grupie na zapis, a przeniesiony `settings.json` również wymaga zapisu grupowego. Po migracji plik z trybem 0640 blokował zapis admina; poprawiono go na 0660 (bez dostępu dla innych). Synchronizator tworzy pliki i katalog blokady wewnątrz storage. Korekty galerii są zapisywane oddzielnie w `photo-edits.json`.

```bash
cd /opt/walldeck/repository
git pull --ff-only
cd apps/web-panel
docker compose up -d --build --remove-orphans
docker image prune -f
```

Przed aktualizacją należy sprawdzić, czy w repozytorium na serwerze nie ma lokalnych zmian. Wdrożenie nie modyfikuje katalogów danych.

## Dane i przyszły NAS

Zmienne `WALLDECK_DATA_DIR` i `WALLDECK_PHOTO_DIR` wskazują katalogi hosta montowane do kontenera. Po przygotowaniu NAS wystarczy zatrzymać kontener, skopiować zdjęcia, zamontować udział w stałym punkcie i zmienić `WALLDECK_PHOTO_DIR` w lokalnym `.env`.

Kopia VM nie wystarcza dla przyszłych bind mountów z NAS. Dane runtime oraz zdjęcia muszą mieć osobny harmonogram kopii na drugi dysk.

## Diagnostyka

```bash
docker compose ps
docker compose logs --tail=200 web-panel
curl --fail http://127.0.0.1:8080/api/settings
```

Status `healthy` oznacza, że serwer odpowiada i potrafi odczytać ustawienia. Dostępność Home Assistant, Spotify i źródła zdjęć diagnozuje się osobno w panelu administratora.

Compose ogranicza pojedynczy plik logu kontenera do 10 MB i zachowuje trzy rotacje, aby logi nie wypełniły małego dysku systemowego VM.
