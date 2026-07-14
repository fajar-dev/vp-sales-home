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
}
