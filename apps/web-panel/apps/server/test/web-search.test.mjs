import assert from "node:assert/strict";
import test from "node:test";
import { extractWebSearchImages } from "../dist/web-search.js";

test("extracts canonical OpenAI image search results with captions and source pages", () => {
  const images = extractWebSearchImages([{
    type: "web_search_call",
    results: [
      {
        type: "image_result",
        image_url: "https://images.example/sphynx.jpg",
        thumbnail_url: "https://images.example/sphynx-small.jpg",
        source_website_url: "https://example.com/sphynx",
        caption: "Kot rasy sfinks",
      },
    ],
  }], "kot sfinks");

  assert.deepEqual(images, [{
    url: "https://images.example/sphynx.jpg",
    sourceUrl: "https://example.com/sphynx",
    alt: "Kot rasy sfinks",
  }]);
});

test("accepts action results, falls back to thumbnail and removes duplicates", () => {
  const images = extractWebSearchImages([{
    action: { results: [
      { thumbnail_url: "https://images.example/cat.jpg", title: "Sfinks" },
      { thumbnail_url: "https://images.example/cat.jpg", title: "Duplikat" },
      { image_url: "javascript:alert(1)", title: "Niebezpieczny URL" },
    ] },
  }], "kot sfinks");

  assert.deepEqual(images, [{ url: "https://images.example/cat.jpg", alt: "Sfinks" }]);
});
