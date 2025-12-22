// app/api/lines/route.ts
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

function deptToPrefixes(dept: string) {
  const d = dept.toUpperCase();
  if (d === "INJECTION") return ["12", "16", "22"];
  if (d === "ST") return ["13", "14", "15", "23", "24", "25"];
  if (d === "ASSY") return ["11", "21"];
  return [];
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

    const todayYmd = getTodayYmdJakarta();
    const yesterdayYmd = prevYmdFrom(todayYmd);
    const selectedYmd = view === "yesterday" ? yesterdayYmd : todayYmd;

    const p2 = deptToPrefixes(dept);
    if (!p2.length) {
      return NextResponse.json(
        { error: `Dept tidak dikenal: ${dept}` },
        { status: 400 }
      );
    }

    const cacheKey = `lines_fast_v3:${dept}:${view}:${selectedYmd}`;

    const data = await getCached(cacheKey, async () => {
      const pool = await getSqlPool();

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
      for (const r of meta.recordset ?? []) {
        typMap.set(`${r.tbl}.${r.col}`, String(r.typ).toLowerCase());
      }

      const acpType = typMap.get("TPN0007_201.I_ACP_DATE") || "";
      const dymdType = typMap.get("TBL_R_PRODPLAN_MIRROR.D_YMD") || "";

      const ymdAsInt = Number(selectedYmd);

      const req = pool.request();
      if (acpType.includes("int")) req.input("ACP_YMD", ymdAsInt);
      else req.input("ACP_YMD", selectedYmd);

      if (dymdType.includes("int")) req.input("PLAN_YMD", ymdAsInt);
      else req.input("PLAN_YMD", selectedYmd);

      req.input("P0", p2[0]);
      req.input("P1", p2[1] ?? null);
      req.input("P2", p2[2] ?? null);
      req.input("P3", p2[3] ?? null);
      req.input("P4", p2[4] ?? null);
      req.input("P5", p2[5] ?? null);

      const result = await req.query(`
        SET NOCOUNT ON;

        WITH X AS (
          SELECT
            line = SETSUBICD,
            target = SUM(CAST(QTY AS BIGINT)),
            actual = CAST(0 AS BIGINT),
            setupSec = CAST(0 AS BIGINT)
          FROM dbo.TBL_R_PRODPLAN_MIRROR WITH (INDEX(IX_PRODPLAN_Date_P2))
          WHERE D_YMD = @PLAN_YMD
            AND SETSUBICD_P2 IN (@P0,@P1,@P2,@P3,@P4,@P5)
            AND SETSUBICD IS NOT NULL AND SETSUBICD <> ''
          GROUP BY SETSUBICD

          UNION ALL

          SELECT
            line = I_IND_DEST_CD,
            target = CAST(0 AS BIGINT),
            actual = SUM(CAST(I_ACP_QTY AS BIGINT)),
            setupSec = SUM(CAST(ISNULL(I_SETUP_SEC, 0) AS BIGINT))
          FROM dbo.TPN0007_201 WITH (INDEX(IX_TPN0007_201_Date_P2))
          WHERE I_ACP_DATE = @ACP_YMD
            AND I_IND_DEST_CD_P2 IN (@P0,@P1,@P2,@P3,@P4,@P5)
            AND I_IND_DEST_CD IS NOT NULL AND I_IND_DEST_CD <> ''
          GROUP BY I_IND_DEST_CD
        )
        SELECT
          line,
          target = SUM(target),
          actual = SUM(actual),
          setupSec = SUM(setupSec)
        FROM X
        GROUP BY line
        ORDER BY line ASC
        OPTION (RECOMPILE);
      `);

      return (result.recordset ?? []).map((row: any) => {
        const target = Number(row.target) || 0;
        const actual = Number(row.actual) || 0;
        const setupSec = Number(row.setupSec) || 0;
        const efficiency =
          target > 0 ? Number(((actual / target) * 100).toFixed(1)) : 0;

        return {
          line: row.line,
          target,
          actual,
          efficiency,
          setupSec,
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
