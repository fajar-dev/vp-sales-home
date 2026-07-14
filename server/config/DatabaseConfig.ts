/**
 * OOP Database Configuration Class
 * Reads and encapsulates environment configurations for MySQL connection pool & report scope.
 */
export class DatabaseConfig {
  private static readEnv(name: string, fallback?: string): string {
    const value = process.env[name];
    if (value === undefined || value === "") {
      if (fallback !== undefined) return fallback;
      throw new Error(
        `Missing required environment variable: ${name}. Add it to .env.local`,
      );
    }
    return value;
  }

  public static get host(): string {
    return this.readEnv("DB_HOST", "127.0.0.1");
  }

  public static get port(): number {
    return Number(this.readEnv("DB_PORT", "3306"));
  }

  public static get user(): string {
    return this.readEnv("DB_USER", "root");
  }

  public static get password(): string {
    return this.readEnv("DB_PASSWORD", "");
  }

  public static get database(): string {
    return this.readEnv("DB_NAME", "");
  }

  public static get connectionLimit(): number {
    return Number(this.readEnv("DB_POOL_LIMIT", "10"));
  }

  public static get branchId(): string {
    return this.readEnv("REPORT_BRANCH_ID", "020");
  }

  public static get serviceCategory(): string {
    return this.readEnv("REPORT_SERVICE_CATEGORY", "access_home");
  }

  // ── Redis Cache Configuration ──────────────────────────────────
  public static get cacheEnabled(): boolean {
    return this.readEnv("CACHE_ENABLED", "false").toLowerCase() === "true";
  }

  public static get redisHost(): string {
    return this.readEnv("REDIS_HOST", "127.0.0.1");
  }

  public static get redisPort(): number {
    return Number(this.readEnv("REDIS_PORT", "6379"));
  }

  public static get redisPassword(): string {
    return this.readEnv("REDIS_PASSWORD", "");
  }

  public static get redisDb(): number {
    return Number(this.readEnv("REDIS_DB", "0"));
  }

  public static get redisCacheTtl(): number {
    return Number(this.readEnv("REDIS_CACHE_TTL", "86400")); // Default 24 hours (86400 seconds)
  }
}
