// app/api/dashboard/route.ts
import { NextResponse } from "next/server";
import sql from "mssql";

const sqlServerConfig: sql.config = {
  user: process.env.SQLSERVER_USER || "appAsakai",
  password: process.env.SQLSERVER_PASSWORD || "W3d4ng4ns0l0",
  server: process.env.SQLSERVER_SERVER || "172.17.100.9",
  database: process.env.SQLSERVER_DB || "Asakai",
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

// Mapping dept dari 2 digit awal I_IND_DEST_CD
const DEPT_CASE = `
  CASE
    WHEN LEFT(I_IND_DEST_CD, 2) IN ('12','16','22') THEN 'INJECTION'
    WHEN LEFT(I_IND_DEST_CD, 2) IN ('13','14','15','23','24','25') THEN 'ST'
    WHEN LEFT(I_IND_DEST_CD, 2) IN ('11','21')      THEN 'ASSY'
    ELSE NULL
  END
`;

export async function GET() {
  try {
    const pool = await sql.connect(sqlServerConfig);

    const result = await pool.request().query(`
      SELECT
        ${DEPT_CASE} AS dept,
        0 AS qty_seihan,                     -- target (sementara 0 dulu)
        SUM(I_ACP_QTY) AS qty_aktual         -- Production Result = SUM I_ACP_QTY
      FROM dbo.HHT_GATHERING_INF_MIRROR
      WHERE I_ACP_DATE >= '2025-12-10'
        AND I_ACP_DATE <  '2025-12-11'
        AND ${DEPT_CASE} IS NOT NULL
      GROUP BY ${DEPT_CASE}
    `);

    await pool.close();

    return NextResponse.json(result.recordset ?? []);
  } catch (err) {
    console.error("ERROR /api/dashboard:", err);
    return NextResponse.json({ error: "db-error" }, { status: 500 });
  }
}
