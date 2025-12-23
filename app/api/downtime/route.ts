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

/** ✅ dept -> lines (SAMA seperti dashboard) */
function deptToLines(dept: string): string[] | null {
  const d = (dept || "").trim().toUpperCase();
  if (d === "ASSY") return ["11", "21"];
  if (d === "INJECTION") return ["12", "16", "22"];
  if (d === "ST") return ["13", "14", "15", "23", "24", "25"];
  if (d === "DETAIL" || d === "ALL")
    return ["11", "21", "12", "16", "22", "13", "14", "15", "23", "24", "25"];
  return null;
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

    // ✅ mode opsional
    // - (kosong) legacy: TETAP pakai I_IND_DEST_CD = @LINE dan SUM(I_SETUP_SEC)
    // - dept: untuk pie chart -> filter dept lines, dan setupSec = SUM(I_SETUP_SEC)/SUM(MANCNT)
    const mode = (searchParams.get("mode") || "").trim().toLowerCase();
    const deptLines = mode === "dept" ? deptToLines(line) : null;

    const todayYmd = getTodayYmdJakarta();
    const yesterdayYmd = prevYmdFrom(todayYmd);
    const selectedYmd = view === "yesterday" ? yesterdayYmd : todayYmd;

    const cacheKey = `downtime_v3:${mode || "legacy"}:${line}:${view}:${selectedYmd}`;

    const data = await getCached(cacheKey, async () => {
      const pool = await getSqlPool();

      // detect tipe tanggal biar index kepakai
      const metaDate = await pool.request().query(`
        SELECT t.name AS typ
        FROM sys.columns c
        JOIN sys.types t ON c.user_type_id = t.user_type_id
        WHERE c.object_id = OBJECT_ID('dbo.TPN0007_201')
          AND c.name = 'I_ACP_DATE';
      `);

      const acpType = String(metaDate.recordset?.[0]?.typ || "").toLowerCase();
      const ymdAsInt = Number(selectedYmd);

      // ✅ detect kolom line: P2 atau non-P2 (dept mode cenderung pakai P2)
      const metaDest = await pool.request().query(`
        SELECT c.name AS col
        FROM sys.columns c
        WHERE c.object_id = OBJECT_ID('dbo.TPN0007_201')
          AND c.name IN ('I_IND_DEST_CD_P2', 'I_IND_DEST_CD', 'MANCNT');
      `);

      const cols = (metaDest.recordset ?? []).map((r: any) => String(r.col));
      const hasP2 = cols.includes("I_IND_DEST_CD_P2");
      const hasManCnt = cols.includes("MANCNT");

      const destColForDeptMode = hasP2 ? "I_IND_DEST_CD_P2" : "I_IND_DEST_CD";

      const req = pool.request().input("LINE", line);
      if (acpType.includes("int")) req.input("ACP_YMD", ymdAsInt);
      else req.input("ACP_YMD", selectedYmd);

      if (deptLines) deptLines.forEach((v, i) => req.input(`L${i}`, v));

      // ✅ WHERE line:
      // - legacy: TETAP pakai I_IND_DEST_CD = @LINE (jangan diubah)
      // - dept: IN (...) memakai P2 jika ada
      const whereLineClause =
        deptLines && deptLines.length
          ? `AND CAST(${destColForDeptMode} AS varchar(10)) IN (${deptLines
              .map((_, i) => `@L${i}`)
              .join(", ")})`
          : `AND I_IND_DEST_CD = @LINE`;

      // ✅ SELECT setupSec:
      // - legacy: SUM(I_SETUP_SEC) (TETAP)
      // - dept : SUM(I_SETUP_SEC)/SUM(MANCNT) (sesuai request)
      //   kalau kolom MANCNT tidak ada, fallback ke SUM(I_SETUP_SEC) supaya tidak error.
      const setupExpr =
        mode === "dept" && hasManCnt
          ? `
            CAST(
              SUM(CAST(ISNULL(I_SETUP_SEC, 0) AS BIGINT))
              / NULLIF(SUM(CAST(ISNULL(MANCNT, 0) AS BIGINT)), 0)
              AS BIGINT
            )
          `
          : `SUM(CAST(ISNULL(I_SETUP_SEC, 0) AS BIGINT))`;

      // ✅ HAVING:
      // - legacy: cukup setup > 0 (TETAP)
      // - dept : setup > 0 dan sum(MANCNT) > 0 (kalau ada MANCNT)
      const havingClause =
        mode === "dept" && hasManCnt
          ? `
            HAVING
              SUM(CAST(ISNULL(I_SETUP_SEC, 0) AS BIGINT)) > 0
              AND SUM(CAST(ISNULL(MANCNT, 0) AS BIGINT)) > 0
          `
          : `
            HAVING SUM(CAST(ISNULL(I_SETUP_SEC, 0) AS BIGINT)) > 0
          `;

      const result = await req.query(`
        SET NOCOUNT ON;

        SELECT
          code = NULLIF(LTRIM(RTRIM(CAST(I_RJT_REASON_CD AS varchar(50)))), ''),
          setupSec = ${setupExpr}
        FROM dbo.TPN0007_201
        WHERE I_ACP_DATE = @ACP_YMD
          ${whereLineClause}
          AND I_RJT_REASON_CD IS NOT NULL
          AND LTRIM(RTRIM(CAST(I_RJT_REASON_CD AS varchar(50)))) <> ''
        GROUP BY NULLIF(LTRIM(RTRIM(CAST(I_RJT_REASON_CD AS varchar(50)))), '')
        ${havingClause}
        ORDER BY setupSec DESC, code ASC
        OPTION (RECOMPILE);
      `);

      return (result.recordset ?? []).map((r: any) => ({
        code: r.code,
        setupSec: Number(r.setupSec) || 0,
        ymd: selectedYmd,
        view,
        line,
        mode: mode || "legacy",
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
