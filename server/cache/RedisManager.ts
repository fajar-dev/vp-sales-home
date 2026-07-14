import Redis from "ioredis";
import { DatabaseConfig } from "../config/DatabaseConfig";

declare global {
  var __vpSalesRedisInstance: Redis | undefined;
}

/**
 * Singleton RedisManager Class.
 * Provides feature-flagged caching with graceful failover (fallbacks to DB if Redis is unreachable).
 */
export class RedisManager {
  private static instance: Redis | undefined;

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
    const client = this.getClient();
    if (!client) return null;

    try {
      const data = await client.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (err) {
      console.warn(`[RedisManager] Cache GET error for key "${key}":`, err);
      return null;
    }
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
    const client = this.getClient();
    if (!client) return;

    try {
      const ttl = ttlSeconds ?? DatabaseConfig.redisCacheTtl;
      const json = JSON.stringify(value);
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
    const client = this.getClient();
    if (!client) return;

    try {
      await client.del(key);
    } catch (err) {
      console.warn(`[RedisManager] Cache DEL error for key "${key}":`, err);
    }
  }
}
