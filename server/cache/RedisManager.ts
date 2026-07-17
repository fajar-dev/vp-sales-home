import Redis from "ioredis";
import { DatabaseConfig } from "../config/DatabaseConfig";

declare global {
  var __vpSalesRedisInstance: Redis | undefined;
}

interface MemoryEntry {
  json: string;
  expiresAt: number;
}

/** In-process fallback cache size cap (payloads are a few MB each). */
const MEMORY_CACHE_MAX_ENTRIES = 100;
/** Fallback TTL is capped so stale data cannot outlive Redis TTL semantics. */
const MEMORY_CACHE_MAX_TTL_MS = 15 * 60 * 1000;

/**
 * Singleton RedisManager Class.
 * Provides feature-flagged caching with graceful failover: when Redis is
 * unreachable, a bounded in-process memory cache (max 15 min TTL) still
 * absorbs repeated heavy queries; if both miss, callers fall through to DB.
 */
export class RedisManager {
  private static instance: Redis | undefined;
  private static memory = new Map<string, MemoryEntry>();

  private static memoryGet(key: string): string | null {
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.memory.delete(key);
      return null;
    }
    return entry.json;
  }

  private static memorySet(key: string, json: string, ttlSeconds: number): void {
    if (this.memory.size >= MEMORY_CACHE_MAX_ENTRIES) {
      const oldestKey = this.memory.keys().next().value;
      if (oldestKey !== undefined) this.memory.delete(oldestKey);
    }
    const ttlMs = Math.min(
      ttlSeconds > 0 ? ttlSeconds * 1000 : MEMORY_CACHE_MAX_TTL_MS,
      MEMORY_CACHE_MAX_TTL_MS,
    );
    this.memory.set(key, { json, expiresAt: Date.now() + ttlMs });
  }

  private static getClient(): Redis | null {
    if (!DatabaseConfig.cacheEnabled) {
      return null;
    }

    if (!global.__vpSalesRedisInstance) {
      try {
        const client = new Redis({
          host: DatabaseConfig.redisHost,
          port: DatabaseConfig.redisPort,
          password: DatabaseConfig.redisPassword || undefined,
          db: DatabaseConfig.redisDb,
          connectTimeout: 5000,
          maxRetriesPerRequest: 1,
          retryStrategy(times) {
            // Stop retrying quickly if unreachable to prevent blocking DB queries
            if (times > 3) return null;
            return Math.min(times * 200, 2000);
          },
          lazyConnect: true,
        });

        client.on("error", (err) => {
          console.warn("[RedisManager] Redis connection warning:", err.message);
        });

        global.__vpSalesRedisInstance = client;
      } catch (err) {
        console.warn("[RedisManager] Failed to instantiate Redis client:", err);
        return null;
      }
    }

    this.instance = global.__vpSalesRedisInstance;
    return this.instance;
  }

  /**
   * Fetches parsed JSON value from Redis cache.
   * Returns `null` if cache disabled, cache miss, or if Redis error occurs.
   */
  public static async get<T>(key: string): Promise<T | null> {
    if (!DatabaseConfig.cacheEnabled) return null;

    const client = this.getClient();
    if (client) {
      try {
        const data = await client.get(key);
        if (data) return JSON.parse(data) as T;
      } catch (err) {
        console.warn(`[RedisManager] Cache GET error for key "${key}":`, err);
      }
    }

    const fallback = this.memoryGet(key);
    return fallback ? (JSON.parse(fallback) as T) : null;
  }

  /**
   * Stores JSON stringified value in Redis cache with TTL.
   * Uses default TTL from REDIS_CACHE_TTL env (86400s / 24h) if not specified.
   */
  public static async set<T>(
    key: string,
    value: T,
    ttlSeconds?: number,
  ): Promise<void> {
    if (!DatabaseConfig.cacheEnabled) return;

    const ttl = ttlSeconds ?? DatabaseConfig.redisCacheTtl;
    const json = JSON.stringify(value);

    this.memorySet(key, json, ttl);

    const client = this.getClient();
    if (!client) return;
    try {
      if (ttl > 0) {
        await client.set(key, json, "EX", ttl);
      } else {
        await client.set(key, json);
      }
    } catch (err) {
      console.warn(`[RedisManager] Cache SET error for key "${key}":`, err);
    }
  }

  /**
   * Removes key from Redis cache.
   */
  public static async del(key: string): Promise<void> {
    this.memory.delete(key);

    const client = this.getClient();
    if (!client) return;

    try {
      await client.del(key);
    } catch (err) {
      console.warn(`[RedisManager] Cache DEL error for key "${key}":`, err);
    }
  }
}
