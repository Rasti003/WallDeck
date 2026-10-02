import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { collectToolTrace } from "../dist/assistant.js";
import { EncryptedSecretStore } from "../dist/secret-store.js";

test("OpenAI API key is encrypted at rest and can be replaced", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "walldeck-secret-"));
  try {
    const store = new EncryptedSecretStore(root, "openai-api-key");
    await store.save("sk-test-secret-value-1234567890");
    const raw = await readFile(path.join(root, "openai-api-key.secret.json"), "utf8");
    assert.equal(raw.includes("sk-test-secret"), false);
    assert.equal(await store.load(), "sk-test-secret-value-1234567890");
    await store.save("sk-replaced-secret-value-0987654321");
    assert.equal(await store.load(), "sk-replaced-secret-value-0987654321");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("assistant trace pairs MCP calls with their outputs", () => {
  const trace = collectToolTrace([
    { type: "tool_call_item", rawItem: { type: "function_call", callId: "call-1", name: "get_status", arguments: "{}" } },
    { type: "tool_call_output_item", rawItem: { type: "function_call_result", callId: "call-1" }, output: "{\"currentView\":\"photos\"}" },
  ]);
  assert.deepEqual(trace, [{ name: "get_status", arguments: {}, output: { currentView: "photos" } }]);
});
