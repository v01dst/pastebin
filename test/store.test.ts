import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { openDb, type Db } from "../src/db.js";
import {
  PasteStore,
  PasteNotFoundError,
  PasteExpiredError,
  PasteBurnedError,
  contentHash,
  generateId,
} from "../src/store.js";

describe("generateId", () => {
  it("makes unique base62 ids", () => {
    const ids = new Set(Array.from({ length: 300 }, () => generateId()));
    expect(ids.size).toBe(300);
    for (const id of ids) expect(id).toMatch(/^[0-9a-zA-Z]{8}$/);
  });
});

describe("contentHash", () => {
  it("is stable sha256", () => {
    expect(contentHash("abc")).toBe(contentHash("abc"));
    expect(contentHash("abc")).toHaveLength(64);
  });
});

describe("PasteStore", () => {
  let db: Db;
  let store: PasteStore;
  const base = "http://test.local";
  const t0 = Date.parse("2026-09-04T00:00:00.000Z");

  beforeEach(() => {
    db = openDb(":memory:");
    store = new PasteStore(db, () => "fixedid1");
  });

  afterEach(() => store.close());

  it("creates a paste with metadata", () => {
    const meta = store.create({ content: "hello world" }, base, t0);
    expect(meta.id).toBe("fixedid1");
    expect(meta.url).toBe(`${base}/fixedid1`);
    expect(meta.burnAfterRead).toBe(false);
    expect(meta.expiresAt).toBeNull();
  });

  it("reads content back", () => {
    store.create({ content: "hello world" }, base, t0);
    const paste = store.get("fixedid1", base, t0);
    expect(paste.content).toBe("hello world");
  });

  it("rejects empty content", () => {
    expect(() => store.create({ content: "" }, base, t0)).toThrow(/empty/);
  });

  it("expires pastes after ttl and deletes them", () => {
    store.create({ content: "temp", ttlSeconds: 3600 }, base, t0);
    store.get("fixedid1", base, t0 + 1000);
    expect(() => store.get("fixedid1", base, t0 + 3_601_000)).toThrow(
      PasteExpiredError
    );
  });

  it("burns after first read", () => {
    store.create({ content: "secret", burnAfterRead: true }, base, t0);
    const first = store.get("fixedid1", base, t0);
    expect(first.content).toBe("secret");
    expect(first.burnAfterRead).toBe(true);
    expect(() => store.get("fixedid1", base, t0)).toThrow(PasteNotFoundError);
  });

  it("enforces max views then destroys", () => {
    store.create({ content: "limited", maxViews: 2 }, base, t0);
    store.get("fixedid1", base, t0);
    const second = store.get("fixedid1", base, t0);
    expect(second.remainingViews).toBe(0);
    expect(() => store.get("fixedid1", base, t0)).toThrow(PasteBurnedError);
  });

  it("reports remaining views for unlimited pastes as null", () => {
    store.create({ content: "open" }, base, t0);
    expect(store.get("fixedid1", base, t0).remainingViews).toBeNull();
    expect(store.get("fixedid1", base, t0).remainingViews).toBeNull();
  });

  it("throws PasteNotFoundError for unknown ids", () => {
    expect(() => store.get("missing0", base, t0)).toThrow(PasteNotFoundError);
  });
});
