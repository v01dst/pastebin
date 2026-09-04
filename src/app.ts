import Fastify, { type FastifyInstance } from "fastify";
import { openDb, type Db } from "./db.js";
import { PasteStore } from "./store.js";
import { RateLimiter } from "./rate-limit.js";
import { DEFAULT_CONFIG, type Config } from "./config.js";
import { pasteRoutes } from "./routes.js";
import { homePage } from "./views.js";

export interface AppOptions {
  config?: Partial<Config>;
  db?: Db;
  logger?: boolean;
}

export function createApp(opts: AppOptions = {}): FastifyInstance {
  const config: Config = { ...DEFAULT_CONFIG, ...opts.config };
  const db = opts.db ?? openDb(":memory:");
  const store = new PasteStore(db);
  const limiter = new RateLimiter(config.rateLimitMax, config.rateLimitWindowMs);

  const app = Fastify({ logger: opts.logger ?? false });

  app.addContentTypeParser(
    "text/plain",
    { parseAs: "string" },
    (_req, body, done) => {
      done(null, body);
    }
  );

  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => {
      const obj: Record<string, string> = {};
      for (const [k, v] of new URLSearchParams(body as string)) {
        obj[k] = v;
      }
      done(null, obj);
    }
  );

  app.get("/", async (_request, reply) => {
    return reply
      .header("content-type", "text/html; charset=utf-8")
      .send(homePage(config.baseUrl));
  });

  app.get("/health", async () => ({
    status: "ok",
    uptimeSec: Math.floor(process.uptime()),
  }));

  app.register((instance, _o, done) => {
    pasteRoutes(instance, {
      store,
      baseUrl: config.baseUrl,
      maxBodyBytes: config.maxBodyBytes,
      limiter,
    });
    done();
  });

  app.addHook("onClose", async () => {
    if (!opts.db) db.close();
  });

  return app;
}
