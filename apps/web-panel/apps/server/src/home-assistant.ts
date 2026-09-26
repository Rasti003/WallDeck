import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  HomeAssistantConfigInput,
  HomeAssistantEntity,
  HomeAssistantSelectedState,
  HomeAssistantStatus,
} from "@walldeck/contracts";

interface StoredConfig {
  baseUrl: string;
  dashboardUrl: string;
  co2EntityId: string | null;
  token: { iv: string; tag: string; ciphertext: string };
}

interface RuntimeConfig extends Omit<StoredConfig, "token"> { token: string }
interface RawState {
  entity_id: string;
  state: string;
  last_changed?: string;
  attributes?: Record<string, unknown>;
}

function normalizedBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function entityFromState(value: RawState): HomeAssistantEntity {
  return {
    entityId: value.entity_id,
    state: value.state,
    friendlyName: typeof value.attributes?.friendly_name === "string" ? value.attributes.friendly_name : value.entity_id,
    unit: typeof value.attributes?.unit_of_measurement === "string" ? value.attributes.unit_of_measurement : null,
    deviceClass: typeof value.attributes?.device_class === "string" ? value.attributes.device_class : null,
    lastChanged: value.last_changed ?? null,
  };
}

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

export class HomeAssistantConfigStore {
  private readonly configPath: string;
  private readonly keyPath: string;

  constructor(runtimeRoot: string) {
    this.configPath = path.join(runtimeRoot, "home-assistant.json");
    this.keyPath = path.join(runtimeRoot, ".home-assistant-key");
  }

  async load(): Promise<RuntimeConfig | null> {
    try {
      const stored = JSON.parse(await readFile(this.configPath, "utf8")) as StoredConfig;
      const key = await readOrCreateKey(this.keyPath);
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(stored.token.iv, "base64"));
      decipher.setAuthTag(Buffer.from(stored.token.tag, "base64"));
      const token = Buffer.concat([
        decipher.update(Buffer.from(stored.token.ciphertext, "base64")), decipher.final(),
      ]).toString("utf8");
      return { baseUrl: stored.baseUrl, dashboardUrl: stored.dashboardUrl, co2EntityId: stored.co2EntityId, token };
    } catch {
      return null;
    }
  }

  async save(input: HomeAssistantConfigInput, existingToken?: string): Promise<RuntimeConfig> {
    const token = input.token?.trim() || existingToken;
    if (!token) throw new Error("Token Home Assistant jest wymagany przy pierwszej konfiguracji");
    const key = await readOrCreateKey(this.keyPath);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
    const stored: StoredConfig = {
      baseUrl: normalizedBaseUrl(input.baseUrl),
      dashboardUrl: input.dashboardUrl.trim(),
      co2EntityId: input.co2EntityId || null,
      token: { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") },
    };
    await writeFile(this.configPath, `${JSON.stringify(stored, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await chmod(this.configPath, 0o600).catch(() => undefined);
    return { ...stored, token };
  }
}

export class HomeAssistantClient {
  private config: RuntimeConfig | null = null;
  private socket: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private stopped = false;
  private entities = new Map<string, HomeAssistantEntity>();
  private version: string | null = null;
  private connected = false;
  private lastError: string | null = null;

  constructor(private readonly onEvent: (event: { type: "status" } | { type: "state"; entity: HomeAssistantSelectedState | null }) => void) {}

  get token() { return this.config?.token; }

  status(): HomeAssistantStatus {
    return {
      configured: this.config !== null,
      connected: this.connected,
      baseUrl: this.config?.baseUrl ?? "",
      dashboardUrl: this.config?.dashboardUrl ?? "",
      co2EntityId: this.config?.co2EntityId ?? null,
      version: this.version,
      entityCount: this.entities.size,
      lastError: this.lastError,
    };
  }

  selectedState(): HomeAssistantSelectedState | null {
    const entityId = this.config?.co2EntityId;
    const entity = entityId ? this.entities.get(entityId) : null;
    return entity ? { entityId: entity.entityId, state: entity.state, friendlyName: entity.friendlyName, unit: entity.unit, updatedAt: entity.lastChanged } : null;
  }

  searchEntities(query = ""): HomeAssistantEntity[] {
    const normalized = query.trim().toLocaleLowerCase("pl");
    return [...this.entities.values()]
      .filter((item) => !normalized || `${item.entityId} ${item.friendlyName} ${item.deviceClass ?? ""}`.toLocaleLowerCase("pl").includes(normalized))
      .sort((a, b) => a.friendlyName.localeCompare(b.friendlyName, "pl"))
      .slice(0, 200);
  }

  async test(baseUrl: string, token: string) {
    const root = normalizedBaseUrl(baseUrl);
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
    const [configResponse, statesResponse] = await Promise.all([
      fetch(`${root}/api/config`, { headers, signal: AbortSignal.timeout(8_000) }),
      fetch(`${root}/api/states`, { headers, signal: AbortSignal.timeout(8_000) }),
    ]);
    if (!configResponse.ok || !statesResponse.ok) throw new Error(`Home Assistant odrzucił połączenie (${configResponse.status}/${statesResponse.status})`);
    const config = await configResponse.json() as { version?: string };
    const states = await statesResponse.json() as RawState[];
    return { ok: true as const, version: config.version ?? null, entityCount: states.length };
  }

  async configure(config: RuntimeConfig) {
    this.config = config;
    this.stopped = false;
    this.disconnect();
    await this.connect();
  }

  updateSelection(co2EntityId: string | null, dashboardUrl: string) {
    if (!this.config) return;
    this.config.co2EntityId = co2EntityId;
    this.config.dashboardUrl = dashboardUrl;
    this.onEvent({ type: "state", entity: this.selectedState() });
    this.onEvent({ type: "status" });
  }

  stop() {
    this.stopped = true;
    this.disconnect();
  }

  private disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
    this.connected = false;
  }

  private scheduleReconnect() {
    if (this.stopped || !this.config || this.reconnectTimer) return;
    const delay = Math.min(30_000, 1_000 * 2 ** this.reconnectAttempt++);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private async connect() {
    if (!this.config || this.stopped) return;
    const wsUrl = new URL(this.config.baseUrl);
    wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
    wsUrl.pathname = `${wsUrl.pathname.replace(/\/$/, "")}/api/websocket`;
    try {
      const socket = new WebSocket(wsUrl);
      this.socket = socket;
      socket.onmessage = (event) => this.handleMessage(String(event.data), socket);
      socket.onerror = () => { this.lastError = "Błąd połączenia WebSocket"; };
      socket.onclose = () => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.connected = false;
        this.onEvent({ type: "status" });
        this.scheduleReconnect();
      };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.onEvent({ type: "status" });
      this.scheduleReconnect();
    }
  }

  private handleMessage(raw: string, socket: WebSocket) {
    try {
      const message = JSON.parse(raw) as Record<string, unknown>;
      if (message.type === "auth_required") {
        socket.send(JSON.stringify({ type: "auth", access_token: this.config?.token }));
      } else if (message.type === "auth_ok") {
        this.connected = true;
        this.lastError = null;
        this.reconnectAttempt = 0;
        this.version = typeof message.ha_version === "string" ? message.ha_version : this.version;
        socket.send(JSON.stringify({ id: 1, type: "get_states" }));
        socket.send(JSON.stringify({ id: 2, type: "subscribe_events", event_type: "state_changed" }));
        this.onEvent({ type: "status" });
      } else if (message.type === "auth_invalid") {
        this.lastError = "Home Assistant odrzucił token";
        socket.close();
      } else if (message.type === "result" && message.id === 1 && Array.isArray(message.result)) {
        this.entities = new Map((message.result as RawState[]).map((item) => [item.entity_id, entityFromState(item)]));
        this.onEvent({ type: "status" });
        this.onEvent({ type: "state", entity: this.selectedState() });
      } else if (message.type === "event") {
        const event = message.event as { data?: { entity_id?: string; new_state?: RawState | null } } | undefined;
        const entityId = event?.data?.entity_id;
        const newState = event?.data?.new_state;
        if (entityId && newState) this.entities.set(entityId, entityFromState(newState));
        else if (entityId) this.entities.delete(entityId);
        this.onEvent({ type: "status" });
        if (entityId === this.config?.co2EntityId) this.onEvent({ type: "state", entity: this.selectedState() });
      }
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.onEvent({ type: "status" });
    }
  }
}
