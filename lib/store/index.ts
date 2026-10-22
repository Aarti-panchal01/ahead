// Small key-value interface for the ledger, cache, caps and rate limits.
// Upstash Redis in production, in memory in tests and whenever the Upstash env vars are missing.
// Values are strings; callers JSON-encode what they need.
import { Redis } from "@upstash/redis";

export interface Store {
  readonly kind: "memory" | "upstash";
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Atomic add (negative to subtract). Returns the new value. Sets the expiry when ttlSeconds is given. */
  incrBy(key: string, by: number, ttlSeconds?: number): Promise<number>;
  /** Newest-first list, capped at max entries. */
  push(key: string, value: string, max: number): Promise<void>;
  range(key: string, count: number): Promise<string[]>;
}

export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  private data = new Map<string, { v: string; exp?: number }>();
  private lists = new Map<string, string[]>();
  constructor(private now: () => number = Date.now) {}

  private live(key: string) {
    const e = this.data.get(key);
    if (!e) return undefined;
    if (e.exp !== undefined && e.exp <= this.now()) { this.data.delete(key); return undefined; }
    return e;
  }
  async get(key: string) { return this.live(key)?.v ?? null; }
  async set(key: string, value: string, ttl?: number) {
    this.data.set(key, { v: value, exp: ttl ? this.now() + ttl * 1000 : undefined });
  }
  async del(key: string) { this.data.delete(key); this.lists.delete(key); }
  async incrBy(key: string, by: number, ttl?: number) {
    const e = this.live(key);
    const n = Number(e?.v ?? 0) + by;
    this.data.set(key, { v: String(n), exp: ttl ? this.now() + ttl * 1000 : e?.exp });
    return n;
  }
  async push(key: string, value: string, max: number) {
    const l = this.lists.get(key) ?? [];
    l.unshift(value);
    this.lists.set(key, l.slice(0, max));
  }
  async range(key: string, count: number) { return (this.lists.get(key) ?? []).slice(0, count); }
}

export class UpstashStore implements Store {
  readonly kind = "upstash" as const;
  private r: Redis;
  constructor(url: string, token: string) {
    this.r = new Redis({ url, token, automaticDeserialization: false });
  }
  async get(key: string) {
    const v = await this.r.get<string | null>(key);
    return v === null || v === undefined ? null : String(v);
  }
  async set(key: string, value: string, ttl?: number) {
    if (ttl) await this.r.set(key, value, { ex: ttl }); else await this.r.set(key, value);
  }
  async del(key: string) { await this.r.del(key); }
  async incrBy(key: string, by: number, ttl?: number) {
    const n = await this.r.incrby(key, by);
    if (ttl) await this.r.expire(key, ttl);
    return n;
  }
  async push(key: string, value: string, max: number) {
    await this.r.lpush(key, value);
    await this.r.ltrim(key, 0, max - 1);
  }
  async range(key: string, count: number) {
    return (await this.r.lrange<string>(key, 0, count - 1)).map(String);
  }
}

/** Both env naming schemes the Vercel Marketplace Upstash integration can set. */
export function upstashEnv(env: Record<string, string | undefined> = process.env): { url: string; token: string } | null {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

let current: Store | null = null;
export function getStore(): Store {
  if (!current) {
    const u = upstashEnv();
    current = u ? new UpstashStore(u.url, u.token) : new MemoryStore();
  }
  return current;
}
/** Tests: swap the store (pass null to reset to env-based). */
export function setStore(s: Store | null) { current = s; }
