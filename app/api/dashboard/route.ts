// app/api/dashboard/route.ts
import { NextResponse } from "next/server";
import sql from "mssql";
import { getSqlPool } from "@/lib/mssql";

export const dynamic = "force-dynamic";

// Mapping departemen PLAN (dari SETSUBICD)
const DEPT_CASE_PLAN = `
  CASE
    WHEN LEFT(SETSUBICD, 2) IN ('12','16','22') THEN 'INJECTION'
    WHEN LEFT(SETSUBICD, 2) IN ('13','14','15','23','24','25') THEN 'ST'
    WHEN LEFT(SETSUBICD, 2) IN ('11','21') THEN 'ASSY'
    ELSE NULL
  END
`;

// Mapping departemen RESULT (dari I_IND_DEST_CD)
const DEPT_CASE_RESULT = `
  CASE
    WHEN LEFT(I_IND_DEST_CD, 2) IN ('12','16','22') THEN 'INJECTION'
    WHEN LEFT(I_IND_DEST_CD, 2) IN ('13','14','15','23','24','25') THEN 'ST'
    WHEN LEFT(I_IND_DEST_CD, 2) IN ('11','21') THEN 'ASSY'
    ELSE NULL
  END
`;

// Hitung shift + baseYmd (WIB server)
function getShiftBaseYmd() {
  const now = new Date();
  const hour = now.getHours();

  const toYmd = (dt: Date) => {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}${m}${d}`;
  };

  let shift: 1 | 2;
  let baseDate = new Date(now);

  if (hour >= 8 && hour < 20) {
    shift = 1;
  } else if (hour >= 20) {
    shift = 2;
  } else {
    shift = 2;
    baseDate.setDate(baseDate.getDate() - 1);
  }

  return { shift, baseYmd: toYmd(baseDate) };
}

export async function GET() {
  try {
    const pool = await getSqlPool();
    const { shift, baseYmd } = getShiftBaseYmd();

    const req = pool.request();
    req.input("BASE_YMD", sql.VarChar(8), baseYmd);

    // ✅ supaya gak mentok 15000ms walau config belum kebaca
    req.timeout = 60_000;

    const result = await req.query(`
      WITH PlanDept AS (
        SELECT
          ${DEPT_CASE_PLAN} AS dept,
          SUM(QTY) AS qty_seihan
        FROM dbo.TBL_R_PRODPLAN_MIRROR
        WHERE D_YMD = @BASE_YMD
          AND ${DEPT_CASE_PLAN} IS NOT NULL
        GROUP BY ${DEPT_CASE_PLAN}
      ),
      ResultDept AS (
        SELECT
          ${DEPT_CASE_RESULT} AS dept,
          SUM(CAST(I_ACP_QTY AS bigint)) AS qty_aktual
        FROM dbo.TPN0007_201 WITH (READPAST)
        WHERE I_ACP_DATE = @BASE_YMD
          AND ${DEPT_CASE_RESULT} IS NOT NULL
        GROUP BY ${DEPT_CASE_RESULT}
      )
      SELECT
        COALESCE(p.dept, r.dept) AS dept,
        ISNULL(p.qty_seihan, 0) AS qty_seihan,
        ISNULL(r.qty_aktual, 0) AS qty_aktual
      FROM PlanDept p
      FULL OUTER JOIN ResultDept r
        ON p.dept = r.dept;
    `);

    return NextResponse.json({
      shift,
      baseYmd,
      rows: result.recordset ?? [],
    });
  } catch (err) {
    console.error("ERROR /api/dashboard:", err);
    return NextResponse.json({ error: "db-error" }, { status: 500 });
  }
}
