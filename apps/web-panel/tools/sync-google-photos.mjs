#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { syncSharedAlbum } from "./google-photos-shared-album.mjs";

function valueAfter(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const configPath = valueAfter("--config");
let config = {};
if (configPath) config = JSON.parse(await readFile(configPath, "utf8"));

const albumUrl = valueAfter("--album-url") ?? config.albumUrl;
const storagePath = valueAfter("--storage") ?? config.storagePath;
const concurrency = Number(valueAfter("--concurrency") ?? config.concurrency ?? 3);

if (!albumUrl || !storagePath) {
  console.error("Użycie: node tools/sync-google-photos.mjs --config <plik.json> lub --album-url <URL> --storage <katalog> [--concurrency 3]");
  process.exitCode = 2;
} else {
  try {
    const result = await syncSharedAlbum({
      albumUrl,
      storagePath,
      concurrency,
      onProgress(event) {
        if (event.type === "downloaded") {
          console.log(`[${event.downloaded + event.failed}/${event.total}] ${event.filename}`);
        } else {
          console.error(`[błąd ${event.downloaded + event.failed}/${event.total}] ${event.id}: ${event.error}`);
        }
      },
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.failed > 0) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
