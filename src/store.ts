import { randomBytes, createHash } from "node:crypto";
import type { Db } from "./db.js";

const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ID_LENGTH = 8;
export const TTL_CHOICES_SECONDS = [3600, 86400, 604800, 2592000] as const;
export type TtlSeconds = (typeof TTL_CHOICES_SECONDS)[number];

export class PasteNotFoundError extends Error {
  constructor(id: string) {
    super(`paste "${id}" not found`);
    this.name = "PasteNotFoundError";
  }
}

export class PasteExpiredError extends Error {
  constructor(id: string) {
    super(`paste "${id}" has expired`);
    this.name = "PasteExpiredError";
  }
}

export class PasteBurnedError extends Error {
  constructor(id: string) {
    super(`paste "${id}" was burn-after-read and is gone`);
    this.name = "PasteBurnedError";
  }
}

export interface PasteRow {
  id: string;
  content: string;
  language: string | null;
  burns: number;
  max_views: number;
  views: number;
  expires_at: string | null;
  created_at: string;
}

export interface CreatePasteInput {
  content: string;
  language?: string | null;
  ttlSeconds?: TtlSeconds | null;
  burnAfterRead?: boolean;
  maxViews?: number | null;
}

export interface PasteMeta {
  id: string;
  url: string;
  language: string | null;
  burnAfterRead: boolean;
  maxViews: number | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface PasteContent extends PasteMeta {
  content: string;
  remainingViews: number | null;
}

export function generateId(len: number = ID_LENGTH): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ID_ALPHABET[bytes[i]! % ID_ALPHABET.length];
  }
  return out;
}

export function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function isoNowPlus(seconds: number, now: number = Date.now()): string {
  return new Date(now + seconds * 1000).toISOString();
}

export class PasteStore {
  constructor(
    private readonly db: Db,
    private readonly generateIdFn: (len?: number) => string = generateId
  ) {}

  create(input: CreatePasteInput, baseUrl: string, now: number = Date.now()): PasteMeta {
    if (input.content.length === 0) {
      throw new Error("content must not be empty");
    }
    const id = this.generateIdFn();
    const expiresAt = input.ttlSeconds ? isoNowPlus(input.ttlSeconds, now) : null;
    const burn = input.burnAfterRead ? 1 : 0;
    this.db
      .prepare(
        "INSERT INTO pastes (id, content, language, burns, max_views, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(
        id,
        input.content,
        input.language ?? null,
        burn,
        input.burnAfterRead ? 1 : (input.maxViews ?? 0),
        expiresAt
      );
    return {
      id,
      url: `${baseUrl}/${id}`,
      language: input.language ?? null,
      burnAfterRead: Boolean(burn),
      maxViews: input.burnAfterRead ? 1 : (input.maxViews ?? null),
      expiresAt,
      createdAt: (this.db.prepare("SELECT created_at FROM pastes WHERE id = ?").get(id) as { created_at: string }).created_at,
    };
  }

  get(id: string, baseUrl: string, now: number = Date.now()): PasteContent {
    const row = this.db.prepare("SELECT * FROM pastes WHERE id = ?").get(id) as PasteRow | undefined;
    if (!row) throw new PasteNotFoundError(id);

    if (row.expires_at && new Date(row.expires_at).getTime() <= now) {
      this.db.prepare("DELETE FROM pastes WHERE id = ?").run(id);
      throw new PasteExpiredError(id);
    }

    const limit = row.burns === 1 ? 1 : row.max_views > 0 ? row.max_views : null;

    if (row.burns === 1) {
      this.db.prepare("DELETE FROM pastes WHERE id = ?").run(id);
      return this.toContent(row, baseUrl, 0);
    }

    const views = row.views + 1;
    if (limit !== null && views > limit) {
      this.db.prepare("DELETE FROM pastes WHERE id = ?").run(id);
      throw new PasteBurnedError(id);
    }
    this.db.prepare("UPDATE pastes SET views = ? WHERE id = ?").run(views, id);
    return this.toContent(row, baseUrl, limit === null ? null : limit - views);
  }

  private toContent(row: PasteRow, baseUrl: string, remainingViews: number | null): PasteContent {
    return {
      id: row.id,
      url: `${baseUrl}/${row.id}`,
      language: row.language,
      burnAfterRead: row.burns === 1,
      maxViews: row.max_views > 0 ? row.max_views : null,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      content: row.content,
      remainingViews,
    };
  }

  close(): void {
    this.db.close();
  }
}
