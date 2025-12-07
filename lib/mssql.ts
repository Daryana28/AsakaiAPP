// lib/mssql.ts
import sql from "mssql";

console.log("ENV CHECK", {
  user: process.env.SQLSERVER_USER,
  host: process.env.SQLSERVER_HOST,
  db: process.env.SQLSERVER_DB,
}); 

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
};

let pool: sql.ConnectionPool;

export async function getSqlPool() {
  if (!pool) {
    pool = await sql.connect(config);
  } else if (!pool.connected) {
    await pool.connect();
  }
  return pool;
}
