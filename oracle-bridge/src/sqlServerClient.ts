// src/sqlServerClient.ts
import sql from "mssql";
import "dotenv/config";

const sqlConfig: sql.config = {
  user: process.env.SQLSERVER_USER,
  password: process.env.SQLSERVER_PASSWORD,
  server: process.env.SQLSERVER_HOST || "localhost",
  port: Number(process.env.SQLSERVER_PORT || 1433),
  database: process.env.SQLSERVER_DB || "master",
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

let pool: sql.ConnectionPool | null = null;

export async function getSqlPool() {
  if (pool && pool.connected) return pool;
  pool = await sql.connect(sqlConfig);
  return pool;
}