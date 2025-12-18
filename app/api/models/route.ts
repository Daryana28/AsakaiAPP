import { NextResponse } from "next/server";
import { getSqlPool } from "@/lib/mssql";

export const dynamic = "force-dynamic";

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

    const lineParam = searchParams.get("line");
    if (!lineParam) {
      return NextResponse.json(
        { error: "Parameter 'line' wajib diisi" },
        { status: 400 }
      );
    }

    const view = (searchParams.get("view") || "current").toLowerCase() as
      | "current"
      | "yesterday";

    const line = lineParam.trim().toUpperCase();

    const todayYmd = getTodayYmdJakarta();
    const yesterdayYmd = prevYmdFrom(todayYmd);
    const selectedYmd = view === "yesterday" ? yesterdayYmd : todayYmd;

    const cacheKey = `models_fast_v2:${line}:${view}:${selectedYmd}`;

    const rows = await getCached(cacheKey, async () => {
      const pool = await getSqlPool();

      // detect tipe tanggal
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
      for (const r of meta.recordset ?? []) typMap.set(`${r.tbl}.${r.col}`, String(r.typ).toLowerCase());

      const acpType = typMap.get("TPN0007_201.I_ACP_DATE") || "";
      const dymdType = typMap.get("TBL_R_PRODPLAN_MIRROR.D_YMD") || "";

      const ymdAsInt = Number(selectedYmd);

      const req = pool.request().input("LINE", line);

      if (acpType.includes("int")) req.input("ACP_YMD", ymdAsInt);
      else req.input("ACP_YMD", selectedYmd);

      if (dymdType.includes("int")) req.input("PLAN_YMD", ymdAsInt);
      else req.input("PLAN_YMD", selectedYmd);

      const result = await req.query(`
        SET NOCOUNT ON;

        WITH X AS (
          -- TARGET
          SELECT
            model = KANBAN,
            target = SUM(CAST(QTY AS BIGINT)),
            actual = CAST(0 AS BIGINT)
          FROM dbo.TBL_R_PRODPLAN_MIRROR
          WHERE D_YMD = @PLAN_YMD
            AND SETSUBICD = @LINE
            AND KANBAN IS NOT NULL AND KANBAN <> ''
          GROUP BY KANBAN

          UNION ALL

          -- ACTUAL
          SELECT
            model = I_DRW_NO,
            target = CAST(0 AS BIGINT),
            actual = SUM(CAST(I_ACP_QTY AS BIGINT))
          FROM dbo.TPN0007_201
          WHERE I_ACP_DATE = @ACP_YMD
            AND I_IND_DEST_CD = @LINE
            AND I_DRW_NO IS NOT NULL AND I_DRW_NO <> ''
          GROUP BY I_DRW_NO
        )
        SELECT
          model,
          target = SUM(target),
          actual = SUM(actual)
        FROM X
        GROUP BY model
        ORDER BY actual DESC, model ASC
        OPTION (RECOMPILE);
      `);

      return result.recordset ?? [];
    });

    return NextResponse.json(rows);
  } catch (err: any) {
    console.error("API Models Error:", err);
    return NextResponse.json(
      { error: err.message || "Database Error", detail: String(err) },
      { status: 500 }
    );
  }
}
