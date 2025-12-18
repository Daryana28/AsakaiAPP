import { NextResponse } from "next/server";
import { getSqlPool } from "@/lib/mssql";

export const dynamic = "force-dynamic";

// YYYYMMDD in Asia/Jakarta
function getTodayYmdJakarta() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}`;
}

function prevYmdFrom(ymd: string) {
  const dt = new Date(
    Number(ymd.slice(0, 4)),
    Number(ymd.slice(4, 6)) - 1,
    Number(ymd.slice(6, 8))
  );
  dt.setDate(dt.getDate() - 1);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

// micro cache 15s
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
  console.log("[DASHBOARD] route version = v2_p2_union_castsafe");

  try {
    const { searchParams } = new URL(request.url);
    const view = (searchParams.get("view") || "current").toLowerCase() as
      | "current"
      | "yesterday";

    const baseYmd = getTodayYmdJakarta();
    const yesterdayYmd = prevYmdFrom(baseYmd);
    const selectedYmd = view === "yesterday" ? yesterdayYmd : baseYmd;

    const cacheKey = `dashboard:v2:${view}:${selectedYmd}`;

    const payload = await getCached(cacheKey, async () => {
      const pool = await getSqlPool();

      // 1) detect column types so we bind params correctly (avoid implicit conversion)
      const meta = await pool.request().query(`
        SELECT 'TPN0007_201' AS tbl, c.name AS col, t.name AS typ
        FROM sys.columns c
        JOIN sys.types t ON c.user_type_id = t.user_type_id
        WHERE c.object_id = OBJECT_ID('dbo.TPN0007_201') AND c.name = 'I_ACP_DATE'
        UNION ALL
        SELECT 'TBL_R_PRODPLAN_MIRROR' AS tbl, c.name AS col, t.name AS typ
        FROM sys.columns c
        JOIN sys.types t ON c.user_type_id = t.user_type_id
        WHERE c.object_id = OBJECT_ID('dbo.TBL_R_PRODPLAN_MIRROR') AND c.name = 'D_YMD';
      `);

      const typMap = new Map<string, string>();
      for (const r of meta.recordset ?? []) typMap.set(`${r.tbl}.${r.col}`, String(r.typ));

      const acpType = (typMap.get("TPN0007_201.I_ACP_DATE") || "").toLowerCase();
      const dymdType = (typMap.get("TBL_R_PRODPLAN_MIRROR.D_YMD") || "").toLowerCase();

      // bind as INT if column is int/bigint, else bind as varchar(8)
      const ymdAsInt = Number(selectedYmd);

      const req = pool.request();

      if (acpType.includes("int")) req.input("ACP_YMD", ymdAsInt);
      else req.input("ACP_YMD", selectedYmd);

      if (dymdType.includes("int")) req.input("PLAN_YMD", ymdAsInt);
      else req.input("PLAN_YMD", selectedYmd);

      // 2) fast aggregation using persisted prefix columns (must exist)
      const result = await req.query(`
        SET NOCOUNT ON;

        WITH X AS (
          -- TARGET
          SELECT
            dept =
              CASE
                WHEN SETSUBICD_P2 IN ('12','16','22') THEN 'INJECTION'
                WHEN SETSUBICD_P2 IN ('13','14','15','23','24','25') THEN 'ST'
                WHEN SETSUBICD_P2 IN ('11','21') THEN 'ASSY'
                ELSE NULL
              END,
            qty_seihan = SUM(CAST(QTY AS BIGINT)),
            qty_aktual = CAST(0 AS BIGINT)
          FROM dbo.TBL_R_PRODPLAN_MIRROR
          WHERE D_YMD = @PLAN_YMD
          GROUP BY
            CASE
              WHEN SETSUBICD_P2 IN ('12','16','22') THEN 'INJECTION'
              WHEN SETSUBICD_P2 IN ('13','14','15','23','24','25') THEN 'ST'
              WHEN SETSUBICD_P2 IN ('11','21') THEN 'ASSY'
              ELSE NULL
            END

          UNION ALL

          -- ACTUAL
          SELECT
            dept =
              CASE
                WHEN I_IND_DEST_CD_P2 IN ('12','16','22') THEN 'INJECTION'
                WHEN I_IND_DEST_CD_P2 IN ('13','14','15','23','24','25') THEN 'ST'
                WHEN I_IND_DEST_CD_P2 IN ('11','21') THEN 'ASSY'
                ELSE NULL
              END,
            qty_seihan = CAST(0 AS BIGINT),
            qty_aktual = SUM(CAST(I_ACP_QTY AS BIGINT))
          FROM dbo.TPN0007_201
          WHERE I_ACP_DATE = @ACP_YMD
          GROUP BY
            CASE
              WHEN I_IND_DEST_CD_P2 IN ('12','16','22') THEN 'INJECTION'
              WHEN I_IND_DEST_CD_P2 IN ('13','14','15','23','24','25') THEN 'ST'
              WHEN I_IND_DEST_CD_P2 IN ('11','21') THEN 'ASSY'
              ELSE NULL
            END
        )
        SELECT
          dept,
          qty_seihan = SUM(qty_seihan),
          qty_aktual = SUM(qty_aktual)
        FROM X
        WHERE dept IS NOT NULL
        GROUP BY dept
        OPTION (RECOMPILE);
      `);

      const rows = (result.recordset ?? []).map((r: any) => ({
        dept: String(r.dept),
        qty_seihan: Number(r.qty_seihan || 0),
        qty_aktual: Number(r.qty_aktual || 0),
      }));

      return {
        shift: 0, // dummy, frontend masih baca shiftLabel
        baseYmd,
        yesterdayYmd,
        selectedYmd,
        view,
        rows,
      };
    });

    return NextResponse.json(payload);
  } catch (err: any) {
    console.error("API Dashboard Error:", err);
    return NextResponse.json(
      { error: err.message || "Database Error", detail: String(err) },
      { status: 500 }
    );
  }
}
