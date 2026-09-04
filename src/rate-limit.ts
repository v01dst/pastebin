export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    public readonly max: number,
    public readonly windowMs: number
  ) {}

  tryConsume(key: string, now: number = Date.now()): RateLimitResult {
    const cutoff = now - this.windowMs;
    const window = (this.hits.get(key) ?? []).filter((t) => t > cutoff);

    if (window.length >= this.max) {
      this.hits.set(key, window);
      const oldest = Math.min(...window);
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: oldest + this.windowMs - now,
      };
    }

    window.push(now);
    this.hits.set(key, window);
    return {
      allowed: true,
      remaining: this.max - window.length,
      retryAfterMs: 0,
    };
  }
}
