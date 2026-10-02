import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmod, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

type EncryptedSecret = { iv: string; tag: string; ciphertext: string };

async function readOrCreateKey(keyPath: string): Promise<Buffer> {
  try {
    const key = Buffer.from(await readFile(keyPath, "utf8"), "base64");
    if (key.length === 32) return key;
  } catch { /* create below */ }
  const key = randomBytes(32);
  await writeFile(keyPath, key.toString("base64"), { encoding: "utf8", mode: 0o600 });
  await chmod(keyPath, 0o600).catch(() => undefined);
  return key;
}

export class EncryptedSecretStore {
  private readonly valuePath: string;
  private readonly keyPath: string;

  constructor(runtimeRoot: string, name: string) {
    this.valuePath = path.join(runtimeRoot, `${name}.secret.json`);
    this.keyPath = path.join(runtimeRoot, `.${name}.key`);
  }

  async load(): Promise<string | null> {
    try {
      const stored = JSON.parse(await readFile(this.valuePath, "utf8")) as EncryptedSecret;
      const key = await readOrCreateKey(this.keyPath);
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(stored.iv, "base64"));
      decipher.setAuthTag(Buffer.from(stored.tag, "base64"));
      return Buffer.concat([decipher.update(Buffer.from(stored.ciphertext, "base64")), decipher.final()]).toString("utf8");
    } catch {
      return null;
    }
  }

  async save(value: string): Promise<void> {
    const key = await readOrCreateKey(this.keyPath);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const stored: EncryptedSecret = { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
    await writeFile(this.valuePath, `${JSON.stringify(stored)}\n`, { encoding: "utf8", mode: 0o600 });
    await chmod(this.valuePath, 0o600).catch(() => undefined);
  }

  async clear(): Promise<void> {
    await unlink(this.valuePath).catch(() => undefined);
  }
}
