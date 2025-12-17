import { NextResponse } from "next/server";
import { getSqlPool } from "@/lib/mssql";

export const dynamic = "force-dynamic";

const DEPT_CASE_PLAN = `
  CASE
    WHEN LEFT(SETSUBICD, 2) IN ('12','16','22') THEN 'INJECTION'
    WHEN LEFT(SETSUBICD, 2) IN ('13','14','15','23','24','25') THEN 'ST'
    WHEN LEFT(SETSUBICD, 2) IN ('11','21') THEN 'ASSY'
    ELSE NULL
  END
`;

const DEPT_CASE_RESULT = `
  CASE
    WHEN LEFT(I_IND_DEST_CD, 2) IN ('12','16','22') THEN 'INJECTION'
    WHEN LEFT(I_IND_DEST_CD, 2) IN ('13','14','15','23','24','25') THEN 'ST'
    WHEN LEFT(I_IND_DEST_CD, 2) IN ('11','21') THEN 'ASSY'
    ELSE NULL
  END
`;

function toYmd(dt: Date) {
  return (
    dt.getFullYear().toString() +
    String(dt.getMonth() + 1).padStart(2, "0") +
    String(dt.getDate()).padStart(2, "0")
  );
}

function getShiftBaseYmd() {
  const now = new Date();
  const hour = now.getHours();
  if (hour < 8) {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return toYmd(y);
  }
  return toYmd(now);
}

function prevYmdFrom(ymd: string) {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(4, 6)) - 1;
  const d = Number(ymd.slice(6, 8));
  const dt = new Date(y, m, d);
  dt.setDate(dt.getDate() - 1);
  return toYmd(dt);
}

/* ✅ MICRO CACHE */
type CacheItem<T> = { exp: number; value: Promise<T> };
const CACHE_TTL_MS = 15000;
const cache = new Map<string, CacheItem<any>>();

function getCached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.exp > now) return hit.value;

  const value = fn().catch((e) => {
    cache.delete(key);
    throw e;
  });
  cache.set(key, { exp: now + CACHE_TTL_MS, value });
  return value;
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

    const view = (searchParams.get("view") || "current").toLowerCase() as
      | "current"
      | "yesterday";

    const baseYmd = getShiftBaseYmd();
    const yesterdayYmd = prevYmdFrom(baseYmd);
    const selectedYmd = view === "yesterday" ? yesterdayYmd : baseYmd;

    const cacheKey = `lines:${dept}:${view}:${selectedYmd}`;

    const data = await getCached(cacheKey, async () => {
      const pool = await getSqlPool();

      const result = await pool
        .request()
        .input("D_YMD", selectedYmd)
        .input("DEPT", dept)
        .query(`
          SET NOCOUNT ON;

          WITH
          PlanLine AS (
            SELECT
              p.SETSUBICD AS line,
              x.dept,
              SUM(CAST(p.QTY AS BIGINT)) AS target
            FROM dbo.TBL_R_PRODPLAN_MIRROR p
            CROSS APPLY (SELECT ${DEPT_CASE_PLAN} AS dept) x
            WHERE p.D_YMD = @D_YMD
              AND x.dept IS NOT NULL
            GROUP BY p.SETSUBICD, x.dept
          ),
          ResultLine AS (
            SELECT
              r.I_IND_DEST_CD AS line,
              x.dept,
              SUM(CAST(r.I_ACP_QTY AS BIGINT)) AS actual
            FROM dbo.TPN0007_201 r
            CROSS APPLY (SELECT ${DEPT_CASE_RESULT} AS dept) x
            WHERE r.I_ACP_DATE = @D_YMD
              AND r.I_IND_DEST_CD IS NOT NULL
              AND r.I_IND_DEST_CD IS NOT NULL AND r.I_IND_DEST_CD <> ''
              AND x.dept IS NOT NULL
            GROUP BY r.I_IND_DEST_CD, x.dept
          )
          SELECT
            COALESCE(p.line, r.line) AS line,
            ISNULL(p.target, 0) AS target,
            ISNULL(r.actual, 0) AS actual
          FROM PlanLine p
          FULL OUTER JOIN ResultLine r
            ON p.line = r.line AND p.dept = r.dept
          WHERE COALESCE(p.dept, r.dept) = @DEPT
          ORDER BY COALESCE(p.line, r.line) ASC
          OPTION (RECOMPILE);
        `);

      return (result.recordset ?? []).map((row: any) => {
        const target = Number(row.target) || 0;
        const actual = Number(row.actual) || 0;
        const efficiency = target > 0 ? Number(((actual / target) * 100).toFixed(1)) : 0;

        return {
          line: row.line,
          target,
          actual,
          efficiency,
          view,
          ymd: selectedYmd,
        };
      });
    });

    return NextResponse.json(data);
  } catch (err: any) {
    console.error("API Lines Error:", err);
    return NextResponse.json(
      { error: err.message || "Database Error", detail: String(err) },
      { status: 500 }
    );
  }
}
