import assert from "node:assert/strict";
import test from "node:test";
import { parseAlbumPage } from "./google-photos-shared-album.mjs";

test("extracts and deduplicates shared album media", () => {
  const html = `
    ["AF1QipExample_1",["https://lh3.googleusercontent.com/pw/photo-one",3000,4000,null],123]
    ["AF1QipExample_2",["https://lh3.googleusercontent.com/pw/photo-two",1920,1080,null],456]
    ["AF1QipExample_1",["https://lh3.googleusercontent.com/pw/photo-one",3000,4000,null],123]
  `;

  assert.deepEqual(parseAlbumPage(html), [
    { id: "AF1QipExample_1", baseUrl: "https://lh3.googleusercontent.com/pw/photo-one", width: 3000, height: 4000 },
    { id: "AF1QipExample_2", baseUrl: "https://lh3.googleusercontent.com/pw/photo-two", width: 1920, height: 1080 },
  ]);
});

test("returns an empty list for a page without shared media", () => {
  assert.deepEqual(parseAlbumPage("<html><body>private album</body></html>"), []);
});
