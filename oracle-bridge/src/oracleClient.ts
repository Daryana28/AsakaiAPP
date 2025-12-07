// src/oracleClient.ts
import oracledb from "oracledb";
import "dotenv/config";

const oracleConfig = {
  user: process.env.ORACLE_USER,
  password: process.env.ORACLE_PASSWORD,
  connectString: process.env.ORACLE_CONNECT,
};

if (
  !oracleConfig.user ||
  !oracleConfig.password ||
  !oracleConfig.connectString
) {
  console.error("[ORACLE] Config tidak lengkap:", oracleConfig);
  throw new Error("ORACLE_* di .env (oracle-bridge) belum lengkap");
}

export async function queryOracle<T = any>(
  sqlText: string,
  binds: Record<string, any> = {}
): Promise<T[]> {
  let conn;
  try {
    conn = await oracledb.getConnection(oracleConfig);

    const lowered = sqlText.toLowerCase();
    if (
      lowered.includes(" delete ") ||
      lowered.includes(" update ") ||
      lowered.includes(" insert ") ||
      lowered.includes(" alter ") ||
      lowered.includes(" drop ")
    ) {
      throw new Error("Write operations to Oracle are not allowed in this app");
    }

    const result = await conn.execute(sqlText, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });

    return (result.rows || []) as T[];
  } finally {
    if (conn) {
      try {
        await conn.close();
      } catch {
        // ignore error close
      }
    }
  }
}
