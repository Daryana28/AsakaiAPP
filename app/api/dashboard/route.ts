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

// Mapping departemen dari 2 digit awal SETSUBICD
// + tambahan S1 -> ASSY
const DEPT_CASE = `
  CASE
    WHEN LEFT(SETSUBICD, 2) IN ('12','16','22') THEN 'INJECTION'
    WHEN LEFT(SETSUBICD, 2) IN ('13','14','15','23','24','25') THEN 'ST'
    WHEN LEFT(SETSUBICD, 2) IN ('11','21','S1') THEN 'ASSY'
    ELSE NULL
  END
`;

// Hitung tanggal dasar berdasarkan shift
function getShiftBaseYmd() {
  const now = new Date(); // pakai timezone server (di kasus kamu = WIB)
  const hour = now.getHours();

  // helper
  const toYmd = (dt: Date) => {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}${m}${d}`;
  };

  let shift: 1 | 2;
  let baseDate = new Date(now);

  if (hour >= 8 && hour < 20) {
    // 08:00 – 19:59 → Shift 1, tanggal hari ini
    shift = 1;
  } else if (hour >= 20) {
    // 20:00 – 23:59 → Shift 2, tanggal hari ini
    shift = 2;
  } else {
    // 00:00 – 07:59 → Shift 2, tapi tanggal dianggap KEMARIN
    shift = 2;
    baseDate.setDate(baseDate.getDate() - 1);
  }

  return {
    shift,
    baseYmd: toYmd(baseDate), // dipakai untuk filter D_YMD di mirror
  };
}

export async function GET() {
  try {
    const pool = await sql.connect(sqlServerConfig);

    const { shift, baseYmd } = getShiftBaseYmd();
    // console.log("SHIFT:", shift, "BASE_YMD:", baseYmd);

    const request = pool.request().input("BASE_YMD", sql.VarChar(8), baseYmd);

    const result = await request.query(`
      --------------------------------------
      -- Aggregasi TARGET (PLAN) per dept
      --------------------------------------
      WITH PlanDept AS (
        SELECT
          ${DEPT_CASE} AS dept,
          SUM(QTY)    AS qty_seihan
        FROM dbo.TBL_R_PRODPLAN_MIRROR
        WHERE D_YMD = @BASE_YMD
          AND ${DEPT_CASE} IS NOT NULL
        GROUP BY ${DEPT_CASE}
      ),
      --------------------------------------
      -- Aggregasi AKTUAL per dept
      --------------------------------------
      ResultDept AS (
        SELECT
          ${DEPT_CASE} AS dept,
          SUM(CMPQTY) AS qty_aktual
        FROM dbo.TBL_R_PRODRESULT_MIRROR
        WHERE D_YMD = @BASE_YMD
          AND ${DEPT_CASE} IS NOT NULL
        GROUP BY ${DEPT_CASE}
      )
      --------------------------------------
      -- Gabungkan PLAN + AKTUAL
      --------------------------------------
      SELECT
        COALESCE(p.dept, r.dept)     AS dept,
        ISNULL(p.qty_seihan, 0)      AS qty_seihan,
        ISNULL(r.qty_aktual, 0)      AS qty_aktual
      FROM PlanDept p
      FULL OUTER JOIN ResultDept r
        ON p.dept = r.dept;
    `);

    await pool.close();

    // Kalau mau, kamu bisa kirim info shift juga
    const payload = {
      shift,
      baseYmd,
      rows: result.recordset ?? [],
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error("ERROR /api/dashboard:", err);
    return NextResponse.json({ error: "db-error" }, { status: 500 });
  }
}
