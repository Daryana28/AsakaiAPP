// app/api/dashboard/route.ts
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
    console.log("[DASHBOARD] route version = v2_p2_union_castsafe");

    const { searchParams } = new URL(request.url);
    const view = (searchParams.get("view") || "current").toLowerCase() as
      | "current"
      | "yesterday";

    // ✅ KPI filter (optional)
    const kpi = (searchParams.get("kpi") || "").toUpperCase();
    const kpiNorm =
      kpi === "MAIN_KPI" ||
      kpi === "SUB_KPI" ||
      kpi === "PROCESS_KPI" ||
      kpi === "BIRA"
        ? kpi
        : "";

    const todayYmd = getTodayYmdJakarta();
    const yesterdayYmd = prevYmdFrom(todayYmd);
    const selectedYmd = view === "yesterday" ? yesterdayYmd : todayYmd;

    const cacheKey = `dashboard_fast_v2:${view}:${selectedYmd}:kpi=${
      kpiNorm || "ALL"
    }`;

    const payload = await getCached(cacheKey, async () => {
      const pool = await getSqlPool();

      // 🔒 pastikan tipe param match kolom -> index kepakai
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

      // ✅ Query produksi: TIDAK DIUBAH
      const result = await req.query(`
        SET NOCOUNT ON;

        WITH X AS (
          -- TARGET by dept dari PLAN (pakai SETSUBICD_P2)
          SELECT
            dept =
              CASE
                WHEN SETSUBICD_P2 IN ('12','16','22') THEN 'INJECTION'
                WHEN SETSUBICD_P2 IN ('13','14','15','23','24','25') THEN 'ST'
                WHEN SETSUBICD_P2 IN ('11','21') THEN 'ASSY'
                ELSE NULL
              END,
            qty_seihan = SUM(CAST(QTY AS BIGINT)),
            qty_aktual = CAST(0 AS BIGINT),

            -- ✅ NEW: total line stop per dept (detik) -> dari plan tidak ada, isi 0
            lineStopSec = CAST(0 AS BIGINT)
          FROM dbo.TBL_R_PRODPLAN_MIRROR WITH (INDEX(IX_PRODPLAN_Date_P2))
          WHERE D_YMD = @PLAN_YMD
            AND SETSUBICD_P2 IS NOT NULL
          GROUP BY
            CASE
              WHEN SETSUBICD_P2 IN ('12','16','22') THEN 'INJECTION'
              WHEN SETSUBICD_P2 IN ('13','14','15','23','24','25') THEN 'ST'
              WHEN SETSUBICD_P2 IN ('11','21') THEN 'ASSY'
              ELSE NULL
            END

          UNION ALL

          -- ACTUAL by dept dari RESULT (pakai I_IND_DEST_CD_P2)
          SELECT
            dept =
              CASE
                WHEN I_IND_DEST_CD_P2 IN ('12','16','22') THEN 'INJECTION'
                WHEN I_IND_DEST_CD_P2 IN ('13','14','15','23','24','25') THEN 'ST'
                WHEN I_IND_DEST_CD_P2 IN ('11','21') THEN 'ASSY'
                ELSE NULL
              END,
            qty_seihan = CAST(0 AS BIGINT),
            qty_aktual = SUM(CAST(I_ACP_QTY AS BIGINT)),

            -- ✅ NEW: total downtime (detik) per dept dari I_SETUP_SEC
            lineStopSec = SUM(CAST(ISNULL(I_SETUP_SEC, 0) AS BIGINT))
          FROM dbo.TPN0007_201 WITH (INDEX(IX_TPN0007_201_Date_P2))
          WHERE I_ACP_DATE = @ACP_YMD
            AND I_IND_DEST_CD_P2 IS NOT NULL
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
          qty_aktual = SUM(qty_aktual),

          -- ✅ NEW: total downtime per dept (detik)
          lineStopSec = SUM(lineStopSec)
        FROM X
        WHERE dept IS NOT NULL
        GROUP BY dept
        OPTION (RECOMPILE);
      `);

      // ✅ NEW: ambil data upload KPI dari t_asakai_upload
      // (kalau kamu mau filter per dept/kpi di UI, tinggal pakai response ini)
      const asakaiCol = await pool.request().query(`
        SELECT 1 AS ok
        FROM sys.columns
        WHERE object_id = OBJECT_ID('dbo.t_asakai_upload')
          AND name = 'kpi_group';
      `);
      const hasKpi = (asakaiCol.recordset?.length ?? 0) > 0;

      const asakaiQuery = hasKpi
        ? `
          SELECT TOP (200)
            id,
            dept,
            kpi_group,
            file_name,
            file_path,
            file_size,
            cover_name,
            cover_path,
            cover_size
          FROM dbo.t_asakai_upload
          ORDER BY id DESC;
        `
        : `
          SELECT TOP (200)
            id,
            dept,
            CAST(NULL AS NVARCHAR(30)) AS kpi_group,
            file_name,
            file_path,
            file_size,
            cover_name,
            cover_path,
            cover_size
          FROM dbo.t_asakai_upload
          ORDER BY id DESC;
        `;

      const asakaiRes = await pool.request().query(asakaiQuery);
      const asakaiItems = (asakaiRes.recordset ?? []).map((r: any) => ({
        ...r,
        kpi_group: (r.kpi_group ?? "").toString(),
      }));

      // ✅ NEW: group dept -> kpi_group -> items[]
      const asakaiGrouped: Record<
        string,
        Record<string, typeof asakaiItems>
      > = {};

      for (const item of asakaiItems) {
        const d = (item.dept ?? "UNKNOWN").toString();
        const k = (item.kpi_group || "UNSET").toString();

        // kalau dashboard request pakai ?kpi=..., filter di sini
        if (kpiNorm && k !== kpiNorm) continue;

        if (!asakaiGrouped[d]) asakaiGrouped[d] = {};
        if (!asakaiGrouped[d][k]) asakaiGrouped[d][k] = [];
        asakaiGrouped[d][k].push(item);
      }

      return {
        shift: 0,
        baseYmd: todayYmd,
        yesterdayYmd,
        selectedYmd,
        view,
        kpi: kpiNorm || "ALL",

        rows: result.recordset ?? [],

        // ✅ NEW: data KPI upload + grouping
        asakaiItems,
        asakaiGrouped,
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
