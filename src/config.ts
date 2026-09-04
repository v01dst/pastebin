export interface Config {
  port: number;
  host: string;
  dbPath: string;
  baseUrl: string;
  maxBodyBytes: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

export const DEFAULT_CONFIG: Config = {
  port: 3000,
  host: "0.0.0.0",
  dbPath: "./data/pastes.db",
  baseUrl: "http://localhost:3000",
  maxBodyBytes: 128 * 1024,
  rateLimitMax: 30,
  rateLimitWindowMs: 60_000,
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: intEnv("PORT", DEFAULT_CONFIG.port),
    host: env.HOST ?? DEFAULT_CONFIG.host,
    dbPath: env.DB_PATH ?? DEFAULT_CONFIG.dbPath,
    baseUrl: env.BASE_URL ?? DEFAULT_CONFIG.baseUrl,
    maxBodyBytes: intEnv("MAX_BODY_BYTES", DEFAULT_CONFIG.maxBodyBytes),
    rateLimitMax: intEnv("RATE_LIMIT_MAX", DEFAULT_CONFIG.rateLimitMax),
    rateLimitWindowMs: intEnv("RATE_LIMIT_WINDOW_MS", DEFAULT_CONFIG.rateLimitWindowMs),
  };
}
