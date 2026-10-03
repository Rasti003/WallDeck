import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { randomUUID } from "node:crypto";
import type { AssistantCanvasInput } from "@walldeck/contracts";

type CanvasImage = AssistantCanvasInput["images"][number];
type ResolvedAddress = { address: string };
type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const maxImageBytes = 10 * 1024 * 1024;

function isPublicIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return !(a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224);
}

export function isPublicAddress(address: string) {
  if (isIP(address) === 4) return isPublicIpv4(address);
  if (isIP(address) !== 6) return false;
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || /^fe[89ab]/.test(normalized)) return false;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mapped ? isPublicIpv4(mapped) : true;
}

async function defaultResolver(hostname: string) {
  return lookup(hostname, { all: true, verbatim: true });
}

export class AssistantImageCache {
  private entries = new Map<string, { body: Buffer; contentType: string }>();

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly resolver: Resolver = defaultResolver,
  ) {}

  get(id: string) { return this.entries.get(id); }

  async cache(images: CanvasImage[]) {
    const downloaded = await Promise.all(images.map(async image => {
      try {
        const entry = await this.download(image.url);
        return { image, entry };
      } catch (error) {
        return { image, error: error instanceof Error ? error.message : String(error) };
      }
    }));
    const next = new Map<string, { body: Buffer; contentType: string }>();
    const cached: CanvasImage[] = [];
    const rejected: { url: string; reason: string }[] = [];
    for (const result of downloaded) {
      const entry = "entry" in result ? result.entry : undefined;
      if (!entry) {
        rejected.push({ url: result.image.url, reason: result.error ?? "Nie udało się pobrać obrazu" });
        continue;
      }
      const id = randomUUID();
      next.set(id, entry);
      cached.push({ ...result.image, url: `/api/assistant/images/${id}` });
    }
    this.entries = next;
    return { images: cached, rejected };
  }

  private async validate(url: URL) {
    if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("Dozwolone są tylko publiczne adresy HTTPS");
    const addresses = await this.resolver(url.hostname);
    if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw new Error("Adres obrazu nie jest publiczny");
  }

  private async download(rawUrl: string) {
    let url = new URL(rawUrl);
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      await this.validate(url);
      const response = await this.fetcher(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(12_000),
        headers: { accept: "image/avif,image/webp,image/png,image/jpeg,image/gif", "user-agent": "WallDeck/1.0 image-cache" },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirects === 3) throw new Error("Nieprawidłowe przekierowanie obrazu");
        url = new URL(location, url);
        continue;
      }
      if (!response.ok || !response.body) throw new Error(`Serwer obrazu zwrócił HTTP ${response.status}`);
      const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
      if (!allowedTypes.has(contentType)) throw new Error("Odpowiedź nie jest obsługiwanym obrazem");
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (declaredLength > maxImageBytes) throw new Error("Obraz przekracza limit 10 MB");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxImageBytes) { await reader.cancel(); throw new Error("Obraz przekracza limit 10 MB"); }
        chunks.push(value);
      }
      return { body: Buffer.concat(chunks), contentType };
    }
    throw new Error("Za dużo przekierowań obrazu");
  }
}
