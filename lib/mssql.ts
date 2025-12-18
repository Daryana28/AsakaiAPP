// lib/mssql.ts
import sql from "mssql";

const config: sql.config = {
  user: process.env.SQLSERVER_USER!,
  password: process.env.SQLSERVER_PASSWORD!,
  server: process.env.SQLSERVER_SERVER || "localhost",
  port: Number(process.env.SQLSERVER_PORT || 1433),
  database: process.env.SQLSERVER_DB!,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30_000,
  },
  connectionTimeout: 30_000,
  requestTimeout: 120_000, 
};

let poolPromise: Promise<sql.ConnectionPool> | null = null;

export function getSqlPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config).connect();
  }
  return poolPromise;
}
