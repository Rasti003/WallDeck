import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Fastify from "fastify";
import { registerClient } from "../dist/client.js";

test("serves assets created after startup and never returns HTML for missing assets", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "walldeck-client-"));
  const app = Fastify();
  try {
    await writeFile(path.join(root, "index.html"), '<div id="root"></div>');
    await registerClient(app, root);
    await app.ready();
    await mkdir(path.join(root, "assets"));
    await writeFile(path.join(root, "assets", "new-build.js"), "export const ready = true;");
    const asset = await app.inject("/assets/new-build.js");
    assert.equal(asset.statusCode, 200);
    assert.match(asset.headers["content-type"], /javascript/);
    assert.equal(asset.body, "export const ready = true;");
    for (const url of ["/assets/missing.js", "/api/missing"]) {
      const response = await app.inject(url);
      assert.equal(response.statusCode, 404);
      assert.doesNotMatch(response.headers["content-type"], /html/);
    }
    for (const url of ["/admin", "/panel", "/ha", "/music", "/assistant-demo", "/index.html"]) {
      const response = await app.inject(url);
      assert.equal(response.statusCode, 200);
      assert.match(response.headers["content-type"], /html/);
      assert.equal(response.headers["cache-control"], "no-cache");
    }
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
