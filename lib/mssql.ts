// lib/mssql.ts
import sql from "mssql";

const config: sql.config = {
  user: process.env.SQLSERVER_USER,
  password: process.env.SQLSERVER_PASSWORD,
  server: process.env.SQLSERVER_HOST || "localhost",
  port: Number(process.env.SQLSERVER_PORT || 1433),
  database: process.env.SQLSERVER_DB,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },

  // ✅ penting untuk mengurangi timeout random
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30_000,
  },
  connectionTimeout: 30_000,
  requestTimeout: 60_000, // ✅ default 15000ms -> naikin ke 60s
};

let pool: sql.ConnectionPool | null = null;

export async function getSqlPool() {
  if (!pool) {
    pool = await new sql.ConnectionPool(config).connect();
  } else if (!pool.connected) {
    await pool.connect();
  }
  return pool;
}
