import { NextResponse } from "next/server";
import { getSqlPool } from "@/lib/mssql";

export const dynamic = "force-dynamic";

// PLAN: Mapping dept dari 2 digit awal SETSUBICD
const DEPT_CASE_PLAN = `
  CASE
    WHEN LEFT(SETSUBICD, 2) IN ('12','16','22') THEN 'INJECTION'
    WHEN LEFT(SETSUBICD, 2) IN ('13','14','15','23','24','25') THEN 'ST'
    WHEN LEFT(SETSUBICD, 2) IN ('11','21') THEN 'ASSY'
    ELSE NULL
  END
`;

// RESULT: Mapping dept dari 2 digit awal I_IND_DEST_CD (line)
const DEPT_CASE_RESULT = `
  CASE
    WHEN LEFT(I_IND_DEST_CD, 2) IN ('12','16','22') THEN 'INJECTION'
    WHEN LEFT(I_IND_DEST_CD, 2) IN ('13','14','15','23','24','25') THEN 'ST'
    WHEN LEFT(I_IND_DEST_CD, 2) IN ('11','21') THEN 'ASSY'
    ELSE NULL
  END
`;

// Cut-off shift:
// Shift 1: 08:00–20:00 => pakai tanggal hari ini
// Shift 2: 20:00–08:00 => kalau jam < 08:00 pakai tanggal kemarin, selain itu hari ini
function getShiftBaseYmd() {
  const now = new Date();
  const hour = now.getHours();

  const fmt = (dt: Date) =>
    dt.getFullYear().toString() +
    String(dt.getMonth() + 1).padStart(2, "0") +
    String(dt.getDate()).padStart(2, "0");

  if (hour < 8) {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return fmt(y);
  }
  return fmt(now);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dept = searchParams.get("dept");

    if (!dept) {
      return NextResponse.json(
        { error: "Parameter 'dept' wajib diisi" },
        { status: 400 }
      );
    }

    const baseYmd = getShiftBaseYmd();
    const pool = await getSqlPool();

    const result = await pool
      .request()
      .input("D_YMD", baseYmd)
      .input("DEPT", dept)
      .query(`
        WITH
        PlanLine AS (
          SELECT
            SETSUBICD AS line,
            ${DEPT_CASE_PLAN} AS dept,
            SUM(CAST(QTY AS BIGINT)) AS target
          FROM dbo.TBL_R_PRODPLAN_MIRROR
          WHERE D_YMD = @D_YMD
            AND ${DEPT_CASE_PLAN} IS NOT NULL
          GROUP BY SETSUBICD, ${DEPT_CASE_PLAN}
        ),
        ResultLine AS (
          SELECT
            I_IND_DEST_CD AS line,
            ${DEPT_CASE_RESULT} AS dept,
            SUM(CAST(I_ACP_QTY AS BIGINT)) AS actual
          FROM dbo.TPN0007_201
          WHERE CAST(I_ACP_DATE AS VARCHAR(8)) = @D_YMD
            AND I_IND_DEST_CD IS NOT NULL
            AND LTRIM(RTRIM(I_IND_DEST_CD)) <> ''
            AND ${DEPT_CASE_RESULT} IS NOT NULL
          GROUP BY I_IND_DEST_CD, ${DEPT_CASE_RESULT}
        )
        SELECT
          COALESCE(p.line, r.line) AS line,
          ISNULL(p.target, 0) AS target,
          ISNULL(r.actual, 0) AS actual
        FROM PlanLine p
        FULL OUTER JOIN ResultLine r
          ON p.line = r.line AND p.dept = r.dept
        WHERE COALESCE(p.dept, r.dept) = @DEPT
        ORDER BY COALESCE(p.line, r.line) ASC;
      `);

    const data = (result.recordset ?? []).map((row: any) => {
      const target = Number(row.target) || 0;
      const actual = Number(row.actual) || 0;
      const efficiency =
        target > 0 ? Number(((actual / target) * 100).toFixed(1)) : 0;

      return {
        line: row.line,
        target,
        actual,
        efficiency,
      };
    });

    return NextResponse.json(data);
  } catch (err: any) {
    console.error("API Lines Error:", err);
    return NextResponse.json(
      { error: err.message || "Database Error" },
      { status: 500 }
    );
  }
}
