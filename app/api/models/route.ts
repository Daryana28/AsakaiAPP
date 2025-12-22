// app/api/models/route.ts
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

    const cacheKey = `models_fast_v6:${line}:${view}:${selectedYmd}`;

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
      for (const r of meta.recordset ?? []) {
        typMap.set(`${r.tbl}.${r.col}`, String(r.typ).toLowerCase());
      }

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

        /* ========== TARGET per KANBAN (PLAN) ========== */
        WITH TargetAgg AS (
          SELECT
            model = KANBAN,
            target = SUM(CAST(QTY AS BIGINT))
          FROM dbo.TBL_R_PRODPLAN_MIRROR
          WHERE D_YMD = @PLAN_YMD
            AND SETSUBICD = @LINE
            AND KANBAN IS NOT NULL AND KANBAN <> ''
          GROUP BY KANBAN
        ),

        /* ========== ACTUAL per MODEL (RESULT) + SHIFT BREAKDOWN + ITEM_DESC ========== */
        ActualAgg AS (
          SELECT
            model = I_DRW_NO,
            actual = SUM(CAST(I_ACP_QTY AS BIGINT)),
            shift1 = SUM(CASE WHEN I_SHIFT = 31 THEN CAST(I_ACP_QTY AS BIGINT) ELSE 0 END),
            shift2 = SUM(CASE WHEN I_SHIFT = 32 THEN CAST(I_ACP_QTY AS BIGINT) ELSE 0 END),
            shift3 = SUM(CASE WHEN I_SHIFT = 33 THEN CAST(I_ACP_QTY AS BIGINT) ELSE 0 END),
            setupSec = SUM(CAST(ISNULL(I_SETUP_SEC, 0) AS BIGINT)),
            itemDesc = MAX(NULLIF(LTRIM(RTRIM(CAST(I_ITEM_DESC AS varchar(200)))), ''))
          FROM dbo.TPN0007_201
          WHERE I_ACP_DATE = @ACP_YMD
            AND I_IND_DEST_CD = @LINE
            AND I_DRW_NO IS NOT NULL AND I_DRW_NO <> ''
          GROUP BY I_DRW_NO
        ),

        /* ========== REASON per MODEL: pilih yg dominan berdasarkan total setupSec ========== */
        ReasonSetupAgg AS (
          SELECT
            model = I_DRW_NO,
            rjtReasonCd = NULLIF(LTRIM(RTRIM(CAST(I_RJT_REASON_CD AS varchar(50)))), ''),
            sumSetupSec = SUM(CAST(ISNULL(I_SETUP_SEC, 0) AS BIGINT)),
            sumRjtQty   = SUM(CAST(ISNULL(I_RJT_QTY, 0) AS BIGINT)),
            cntRows     = COUNT_BIG(1)
          FROM dbo.TPN0007_201
          WHERE I_ACP_DATE = @ACP_YMD
            AND I_IND_DEST_CD = @LINE
            AND I_DRW_NO IS NOT NULL AND I_DRW_NO <> ''
          GROUP BY I_DRW_NO, NULLIF(LTRIM(RTRIM(CAST(I_RJT_REASON_CD AS varchar(50)))), '')
        ),
        TopReason AS (
          SELECT
            model,
            rjtReasonCd,
            rn = ROW_NUMBER() OVER (
              PARTITION BY model
              ORDER BY sumSetupSec DESC, sumRjtQty DESC, cntRows DESC, rjtReasonCd ASC
            )
          FROM ReasonSetupAgg
          WHERE rjtReasonCd IS NOT NULL
        )

        SELECT
          model = COALESCE(t.model, a.model),
          target = CAST(ISNULL(t.target, 0) AS BIGINT),
          actual = CAST(ISNULL(a.actual, 0) AS BIGINT),
          shift1 = CAST(ISNULL(a.shift1, 0) AS BIGINT),
          shift2 = CAST(ISNULL(a.shift2, 0) AS BIGINT),
          shift3 = CAST(ISNULL(a.shift3, 0) AS BIGINT),
          setupSec = CAST(ISNULL(a.setupSec, 0) AS BIGINT),
          itemDesc = a.itemDesc,
          rjtReasonCd = tr.rjtReasonCd
        FROM TargetAgg t
        FULL OUTER JOIN ActualAgg a
          ON a.model = t.model
        LEFT JOIN TopReason tr
          ON tr.model = COALESCE(t.model, a.model) AND tr.rn = 1
        ORDER BY actual DESC, model ASC
        OPTION (RECOMPILE);
      `);

      return (result.recordset ?? []).map((r: any) => ({
        model: r.model,
        target: Number(r.target) || 0,
        actual: Number(r.actual) || 0,
        shift1: Number(r.shift1) || 0,
        shift2: Number(r.shift2) || 0,
        shift3: Number(r.shift3) || 0,
        setupSec: Number(r.setupSec) || 0,
        itemDesc: r.itemDesc ?? null,
        rjtReasonCd: r.rjtReasonCd ?? null,
      }));
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
