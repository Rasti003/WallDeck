import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SpotifyConnector } from "../dist/spotify.js";

test("Spotify PKCE stores encrypted tokens and returns structured library data", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "walldeck-spotify-"));
  const originalFetch = global.fetch;
  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes("accounts.spotify.com/api/token")) return Response.json({ access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600 });
    if (url.endsWith("/v1/me")) return Response.json({ id: "tester", display_name: "Dom" });
    if (url.includes("/v1/search")) return Response.json({ tracks: { items: [{ uri: "spotify:track:abc", type: "track", name: "Test song", artists: [{ name: "Artist" }], album: { images: [{ url: "https://img" }] } }] } });
    if (url.includes("/v1/me/playlists")) return Response.json({ items: [{ uri: "spotify:playlist:def", type: "playlist", name: "Dom", owner: { display_name: "Owner" }, tracks: { total: 12 }, images: [] }] });
    if (url.includes("/v1/me/player/queue")) return Response.json({ currently_playing: null, queue: [] });
    throw new Error(`Unexpected URL ${url}`);
  };
  try {
    const spotify = new SpotifyConnector(root);
    await spotify.load("a".repeat(32));
    const auth = new URL(spotify.beginAuth());
    assert.equal(auth.searchParams.get("code_challenge_method"), "S256");
    assert.ok(auth.searchParams.get("code_challenge"));
    await spotify.completeAuth("code", auth.searchParams.get("state"));
    assert.equal(spotify.status().connected, true);
    assert.equal(spotify.status().account, "Dom");
    assert.equal((await spotify.search("test", ["track"]))[0].uri, "spotify:track:abc");
    assert.equal((await spotify.playlists())[0].name, "Dom");
    assert.deepEqual(await spotify.queue(), { currentlyPlaying: null, items: [] });
    const stored = await readFile(path.join(root, "spotify-tokens.json"), "utf8");
    assert.ok(!stored.includes("access-secret"));
    assert.ok(!stored.includes("refresh-secret"));
  } finally {
    global.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});
