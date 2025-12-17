import { NextResponse } from "next/server";
import { getSqlPool } from "@/lib/mssql";

export const dynamic = "force-dynamic";

function getShiftBaseYmdJakarta() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const y = get("year");
  const m = get("month");
  const d = get("day");
  const hour = Number(get("hour") || 0);

  const toDate = (ymd: string) =>
    new Date(
      Number(ymd.slice(0, 4)),
      Number(ymd.slice(4, 6)) - 1,
      Number(ymd.slice(6, 8))
    );

  let baseYmd = `${y}${m}${d}`;
  if (hour < 8) {
    const dt = toDate(baseYmd);
    dt.setDate(dt.getDate() - 1);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    baseYmd = `${yy}${mm}${dd}`;
  }
  return baseYmd;
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

    const baseYmd = getShiftBaseYmdJakarta();
    const yesterdayYmd = prevYmdFrom(baseYmd);
    const selectedYmd = view === "yesterday" ? yesterdayYmd : baseYmd;

    const cacheKey = `models:${line}:${view}:${selectedYmd}`;

    const rows = await getCached(cacheKey, async () => {
      const pool = await getSqlPool();

      const result = await pool
        .request()
        .input("D_YMD", selectedYmd)
        .input("LINE", line)
        .query(`
        SET NOCOUNT ON;

            WITH PlanModel AS (
        SELECT
          model = KANBAN,
          target = SUM(CAST(QTY AS bigint))
        FROM dbo.TBL_R_PRODPLAN_MIRROR
        WHERE D_YMD = @D_YMD
          AND SETSUBICD = @LINE
          AND KANBAN IS NOT NULL
        GROUP BY KANBAN
      ),
      ResultModel AS (
        SELECT
          model = I_DRW_NO,
          actual = SUM(CAST(I_ACP_QTY AS bigint))
        FROM dbo.TPN0007_201
        WHERE I_ACP_DATE = @D_YMD
          AND I_IND_DEST_CD = @LINE
          AND I_DRW_NO IS NOT NULL
        GROUP BY I_DRW_NO
      )
      SELECT
        COALESCE(r.model, p.model) AS model,
        ISNULL(p.target, 0) AS target,
        ISNULL(r.actual, 0) AS actual
      FROM ResultModel r
      FULL OUTER JOIN PlanModel p
        ON p.model = r.model
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
