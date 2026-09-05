import type { FastifyInstance } from "fastify";
import {
  PasteStore,
  PasteNotFoundError,
  PasteExpiredError,
  PasteBurnedError,
  TTL_CHOICES_SECONDS,
  contentHash,
  type TtlSeconds,
} from "./store.js";
import { RateLimiter } from "./rate-limit.js";
import { homePage, createdPage, viewPastePage, errorPage } from "./views.js";

export interface PasteRoutesOpts {
  store: PasteStore;
  baseUrl: string;
  maxBodyBytes: number;
  limiter: RateLimiter;
}

function parseTtl(raw: unknown): TtlSeconds | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || !TTL_CHOICES_SECONDS.includes(value as TtlSeconds)) {
    return null;
  }
  return value as TtlSeconds;
}

export function pasteRoutes(app: FastifyInstance, opts: PasteRoutesOpts): void {
  const { store, baseUrl, maxBodyBytes, limiter } = opts;

  const errorResponse = {
    type: "object",
    properties: { error: { type: "string" } },
    required: ["error"],
  } as const;

  app.post(
    "/paste",
    {
      preHandler: async (request, reply) => {
        const result = limiter.tryConsume(request.ip);
        if (!result.allowed) {
          const retrySec = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
          reply.header("retry-after", String(retrySec));
          return reply.status(429).send({ error: "rate limit exceeded" });
        }
      },
      config: {
        rawBody: true,
      },
      schema: {
        response: {
          201: {
            type: "object",
            properties: {
              id: { type: "string" },
              url: { type: "string" },
              language: { type: ["string", "null"] },
              burnAfterRead: { type: "boolean" },
              maxViews: { type: ["number", "null"] },
              expiresAt: { type: ["string", "null"] },
              createdAt: { type: "string" },
            },
          },
          400: errorResponse,
          413: errorResponse,
          429: errorResponse,
        },
      },
    },
    async (request, reply) => {
      const ct = request.headers["content-type"] ?? "";
      let content = "";
      let language: string | null = null;
      let ttlRaw: unknown = null;
      let burn = false;
      let maxViews: number | null = null;

      if (ct.includes("application/json")) {
        const body = request.body as {
          content?: string;
          language?: string;
          ttl?: number;
          burnAfterRead?: boolean;
          maxViews?: number;
        };
        content = body.content ?? "";
        language = body.language ?? null;
        ttlRaw = body.ttl;
        burn = body.burnAfterRead === true;
        maxViews = body.maxViews ?? null;
      } else if (ct.includes("application/x-www-form-urlencoded")) {
        const body = request.body as Record<string, string>;
        content = body.content ?? "";
        language = body.language || null;
        ttlRaw = body.ttl;
        burn = body.burn === "1";
      } else {
        content = (request.body as string) ?? "";
      }

      const bodySize = Buffer.byteLength(content, "utf8");
      if (bodySize === 0) {
        return reply.status(400).send({ error: "content must not be empty" });
      }
      if (bodySize > maxBodyBytes) {
        return reply
          .status(413)
          .send({ error: `content too large (max ${maxBodyBytes} bytes)` });
      }

      const ttl = parseTtl(ttlRaw);
      if (ttlRaw !== undefined && ttlRaw !== null && ttlRaw !== "" && ttl === null) {
        return reply
          .status(400)
          .send({ error: `ttl must be one of ${TTL_CHOICES_SECONDS.join(", ")}` });
      }

      if (maxViews !== null && (!Number.isInteger(maxViews) || maxViews < 1 || maxViews > 100)) {
        return reply.status(400).send({ error: "maxViews must be an integer between 1 and 100" });
      }

      const meta = store.create(
        { content, language, ttlSeconds: ttl, burnAfterRead: burn, maxViews },
        baseUrl
      );
      return reply.status(201).send(meta);
    }
  );

  app.get("/stats", async (_request, reply) => {
    return reply.status(200).send(store.stats());
  });

  app.get(
    "/recent",
    async (request, reply) => {
      const query = request.query as { limit?: string };
      let limit = Number(query.limit) || 10;
      if (!Number.isInteger(limit) || limit < 1) limit = 10;
      limit = Math.min(limit, 50);
      return reply.status(200).send({ pastes: store.recent(limit) });
    }
  );

  app.get(
    "/:id/meta",
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const meta = store.getMeta(id);
      if (!meta) {
        return reply
          .status(404)
          .header("content-type", "text/html; charset=utf-8")
          .send(errorPage(404, `paste "${id}" not found`));
      }
      return reply.status(200).send(meta);
    }
  );

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const paste = store.get(id, baseUrl);
      if (request.headers.accept?.includes("application/json")) {
        return paste;
      }
      return reply
        .header("content-type", "text/html; charset=utf-8")
        .send(viewPastePage(paste));
    } catch (err) {
      if (err instanceof PasteNotFoundError) {
        return reply
          .status(404)
          .header("content-type", "text/html; charset=utf-8")
          .send(errorPage(404, err.message));
      }
      if (err instanceof PasteExpiredError || err instanceof PasteBurnedError) {
        return reply
          .status(410)
          .header("content-type", "text/html; charset=utf-8")
          .send(errorPage(410, err.message));
      }
      throw err;
    }
  });

  app.get("/:id/raw", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const paste = store.get(id, baseUrl);
      return reply
        .header("content-type", "text/plain; charset=utf-8")
        .header("x-content-hash", contentHash(paste.content))
        .send(paste.content);
    } catch (err) {
      if (err instanceof PasteNotFoundError) {
        return reply.status(404).send({ error: err.message });
      }
      if (err instanceof PasteExpiredError || err instanceof PasteBurnedError) {
        return reply.status(410).send({ error: err.message });
      }
      throw err;
    }
  });
}
