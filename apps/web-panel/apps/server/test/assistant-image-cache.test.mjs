import assert from "node:assert/strict";
import test from "node:test";
import { AssistantImageCache, isPublicAddress } from "../dist/assistant-image-cache.js";

test("rejects private and loopback image destinations", () => {
  for (const address of ["127.0.0.1", "10.0.0.4", "172.16.2.3", "192.168.31.153", "169.254.1.1", "::1", "fd00::1"]) {
    assert.equal(isPublicAddress(address), false, address);
  }
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
});

test("downloads safe images and exposes only local Canvas URLs", async () => {
  const fetcher = async () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { status: 200, headers: { "content-type": "image/jpeg" } });
  const cache = new AssistantImageCache(fetcher, async () => [{ address: "203.0.113.10" }]);
  const result = await cache.cache([{ url: "https://images.example/cat.jpg", alt: "Kot", sourceUrl: "https://example.com/cat" }]);
  assert.equal(result.rejected.length, 0);
  assert.match(result.images[0].url, /^\/api\/assistant\/images\/[0-9a-f-]{36}$/);
  assert.equal(result.images[0].sourceUrl, "https://example.com/cat");
  const id = result.images[0].url.split("/").at(-1);
  assert.equal(cache.get(id).contentType, "image/jpeg");
});

test("drops invalid image responses instead of exposing remote URLs", async () => {
  const cache = new AssistantImageCache(async () => new Response("html", { status: 200, headers: { "content-type": "text/html" } }), async () => [{ address: "8.8.8.8" }]);
  const result = await cache.cache([{ url: "https://images.example/not-an-image", alt: "Kot" }]);
  assert.deepEqual(result.images, []);
  assert.equal(result.rejected.length, 1);
});

test("a later presentation does not invalidate earlier image URLs", async () => {
  const cache = new AssistantImageCache(async () => new Response(new Uint8Array([1,2]), {headers:{"content-type":"image/png"}}), async () => [{address:"8.8.8.8"}]);
  const a=await cache.cache([{url:"https://example.com/a",alt:"A"}]);
  await cache.cache([{url:"https://example.com/b",alt:"B"}]);
  assert.ok(cache.get(a.images[0].url.split('/').at(-1)));
});
