import mysql, { Pool, RowDataPacket } from "mysql2/promise";
import { DatabaseConfig } from "../config/DatabaseConfig";

declare global {
  var __vpSalesPoolInstance: Pool | undefined;
}

/**
 * Singleton DatabaseConnection Manager Class.
 * Ensures connection pool reuse across Next.js Lambda & dev reloads.
 */
export class DatabaseConnection {
  private static poolInstance: Pool | undefined;

  public static getPool(): Pool {
    if (!global.__vpSalesPoolInstance) {
      global.__vpSalesPoolInstance = mysql.createPool({
        host: DatabaseConfig.host,
        port: DatabaseConfig.port,
        user: DatabaseConfig.user,
        password: DatabaseConfig.password,
        database: DatabaseConfig.database,
        waitForConnections: true,
        connectionLimit: DatabaseConfig.connectionLimit,
        queueLimit: 0,
        dateStrings: true,
        namedPlaceholders: true,
      });
    }
    this.poolInstance = global.__vpSalesPoolInstance;
    return this.poolInstance;
  }

  /**
   * Executes a parameterized query returning typed rows.
   */
  public static async query<T extends RowDataPacket>(
    sql: string,
    params: Record<string, unknown> = {},
  ): Promise<T[]> {
    const pool = this.getPool();
    const [rows] = await pool.query<T[]>(sql, params as unknown as never);
    return rows;
  }
}
