import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import sharp from "sharp";
import type { FastifyInstance } from "fastify";
import { defaultPhotoEdit, photoEditSchema, type PhotoEdit, type PhotoItem, type PhotoSyncStatus, type WallDeckSettings } from "@walldeck/contracts";

export async function registerPhotos(app: FastifyInstance, photoRoot: string, runtimeRoot: string, broadcast: (event: unknown) => void, settings: () => Promise<WallDeckSettings>) {
  type Item = { id: string; filename: string; active: boolean; width: number; height: number; contentType?: string };
  type Manifest = { items: Record<string, Item>; sourceUrl?: string; lastSyncAt?: string };
  const manifest = async (): Promise<Manifest> => {
    try { return JSON.parse(await readFile(path.join(photoRoot, ".walldeck-album.json"), "utf8")); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return { items: {} }; throw e; }
  };
  const editPath = path.join(runtimeRoot, "photo-edits.json");
  let edits: Record<string, PhotoEdit> = {};
  try { const saved = JSON.parse(await readFile(editPath, "utf8")); for (const [id, edit] of Object.entries(saved)) edits[id] = photoEditSchema.parse(edit); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  let writeQueue = Promise.resolve();
  const status: PhotoSyncStatus = { running: false, lastSyncAt: null, error: null, downloaded: 0 };
  const ids = (m: Manifest) => Object.values(m.items).filter(i => i.active && i.filename).map(i => i.id);
  let previous = await manifest();
  status.lastSyncAt = previous.lastSyncAt ?? null;
  let checking = false;
  const check = async () => {
    if (checking) return;
    checking = true;
    try {
      const next = await manifest();
      const oldIds = new Set(ids(previous));
      const added = ids(next).filter(id => !oldIds.has(id)).length;
      const changed = JSON.stringify(ids(next)) !== JSON.stringify(ids(previous));
      previous = next;
      status.lastSyncAt = next.lastSyncAt ?? null;
      if (changed) broadcast({ type: "photos.changed" });
      if (added && (await settings()).gallery.notifyNewPhotos) broadcast({ type: "notification", notification: { id: `photos:${next.lastSyncAt}`, message: `Dodano nowe zdjęcia: ${added}`, kind: "success", durationMs: (await settings()).gallery.notificationSeconds * 1000, action: "photos" } });
    } finally { checking = false; }
  };
  const timer = setInterval(() => { void check().catch(() => undefined); }, 10_000);
  app.addHook("onClose", async () => clearInterval(timer));
  app.get("/api/photos", async () => Object.values((await manifest()).items).filter(i => i.active && i.filename).map((i): PhotoItem => {
    const edit = edits[i.id] ?? defaultPhotoEdit;
    const rotated = edit.rotation % 180 !== 0;
    const w = rotated ? i.height : i.width, h = rotated ? i.width : i.height;
    return { id: i.id, width: i.width, height: i.height, orientation: w > h * 1.05 ? "landscape" : h > w * 1.05 ? "portrait" : "square", url: `/api/photos/${encodeURIComponent(i.id)}/file`, thumbnailUrl: `/api/photos/${encodeURIComponent(i.id)}/thumbnail`, edit };
  }));
  for (const kind of ["file", "thumbnail"] as const) app.get<{ Params: { id: string } }>(`/api/photos/:id/${kind}`, async (request, reply) => {
    const item = (await manifest()).items[request.params.id];
    if (!item?.active || !item.filename) return reply.code(404).send({ error: "Nie znaleziono zdjęcia" });
    const filename = path.resolve(photoRoot, item.filename);
    if (path.dirname(filename) !== photoRoot) return reply.code(400).send({ error: "Nieprawidłowa ścieżka" });
    reply.header("cache-control", "private, max-age=3600");
    if (kind === "file") return reply.type(item.contentType ?? "image/jpeg").send(createReadStream(filename));
    const cache = path.join(runtimeRoot, "thumbnails");
    await mkdir(cache, { recursive: true });
    const { createHash } = await import("node:crypto");
    const target = path.join(cache, createHash("sha256").update(item.id + item.filename).digest("hex") + ".webp");
    try { return reply.type("image/webp").send(await readFile(target)); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    const buffer = await sharp(filename).rotate().resize(480, 480, { fit: "inside", withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
    await writeFile(target, buffer);
    return reply.type("image/webp").send(buffer);
  });
  app.put<{ Params: { id: string } }>("/api/photos/:id/edit", async (request, reply) => {
    const parsed = photoEditSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Nieprawidłowy kadr" });
    if (!(await manifest()).items[request.params.id]?.active) return reply.code(404).send({ error: "Nie znaleziono zdjęcia" });
    const write = writeQueue.then(async () => {
      const next = { ...edits, [request.params.id]: parsed.data };
      await writeFile(editPath + ".tmp", JSON.stringify(next));
      await rename(editPath + ".tmp", editPath);
      edits = next;
    });
    writeQueue = write.catch(() => undefined);
    await write;
    broadcast({ type: "photos.changed" });
    return parsed.data;
  });
  app.get("/api/photos/sync", async () => ({ ...status, lastSyncAt: (await manifest()).lastSyncAt ?? null }));
  app.post("/api/photos/sync", async (_request, reply) => {
    if (status.running) return reply.code(202).send(status);
    const source = (await manifest()).sourceUrl;
    if (!source) return reply.code(409).send({ error: "Najpierw skonfiguruj źródło albumu na serwerze" });
    status.running = true; status.error = null; status.downloaded = 0;
    broadcast({ type: "photos.sync", status });
    void (async () => {
      try {
        const modulePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../tools/google-photos-shared-album.mjs");
        const { syncSharedAlbum } = await import(pathToFileURL(modulePath).href);
        const result = await syncSharedAlbum({ albumUrl: source, storagePath: photoRoot, concurrency: 3 });
        status.downloaded = result.downloaded;
        if (result.failed) status.error = `Nie udało się pobrać ${result.failed} zdjęć. Spróbuj ponownie.`;
        await check();
      } catch { status.error = "Synchronizacja nie powiodła się. Sprawdź połączenie i dostępność albumu albo spróbuj później."; }
      finally { status.running = false; broadcast({ type: "photos.sync", status }); }
    })();
    return reply.code(202).send(status);
  });
}
