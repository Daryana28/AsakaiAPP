// app/api/downtime/route.ts
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
  return `${get("year")}${get("month")}${get("day")}`; // YYYYMMDD
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

    const cacheKey = `downtime_v1:${line}:${view}:${selectedYmd}`;

    const data = await getCached(cacheKey, async () => {
      const pool = await getSqlPool();

      // detect tipe tanggal biar index kepakai
      const meta = await pool.request().query(`
        SELECT t.name AS typ
        FROM sys.columns c
        JOIN sys.types t ON c.user_type_id = t.user_type_id
        WHERE c.object_id = OBJECT_ID('dbo.TPN0007_201') AND c.name = 'I_ACP_DATE';
      `);

      const acpType = String(meta.recordset?.[0]?.typ || "").toLowerCase();
      const ymdAsInt = Number(selectedYmd);

      const req = pool.request().input("LINE", line);

      if (acpType.includes("int")) req.input("ACP_YMD", ymdAsInt);
      else req.input("ACP_YMD", selectedYmd);

      const result = await req.query(`
        SET NOCOUNT ON;

        SELECT
          code = NULLIF(LTRIM(RTRIM(CAST(I_RJT_REASON_CD AS varchar(50)))), ''),
          setupSec = SUM(CAST(ISNULL(I_SETUP_SEC, 0) AS BIGINT))
        FROM dbo.TPN0007_201
        WHERE I_ACP_DATE = @ACP_YMD
          AND I_IND_DEST_CD = @LINE
          AND I_RJT_REASON_CD IS NOT NULL
          AND LTRIM(RTRIM(CAST(I_RJT_REASON_CD AS varchar(50)))) <> ''
        GROUP BY NULLIF(LTRIM(RTRIM(CAST(I_RJT_REASON_CD AS varchar(50)))), '')
        HAVING SUM(CAST(ISNULL(I_SETUP_SEC, 0) AS BIGINT)) > 0
        ORDER BY setupSec DESC, code ASC
        OPTION (RECOMPILE);
      `);

      return (result.recordset ?? []).map((r: any) => ({
        code: r.code,
        setupSec: Number(r.setupSec) || 0,
        ymd: selectedYmd,
        view,
        line,
      }));
    });

    return NextResponse.json(data);
  } catch (err: any) {
    console.error("API Downtime Error:", err);
    return NextResponse.json(
      { error: err.message || "Database Error", detail: String(err) },
      { status: 500 }
    );
  }
}
