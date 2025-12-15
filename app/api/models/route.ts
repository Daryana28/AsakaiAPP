import { NextResponse } from "next/server";
import { getSqlPool } from "@/lib/mssql";

export const dynamic = "force-dynamic";

// Base date berdasarkan shift (Jakarta)
// jam 00:00–07:59 => pakai tanggal kemarin, selain itu hari ini
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
  return baseYmd; // YYYYMMDD
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lineParam = searchParams.get("line"); // ?line=12A6 dll

    if (!lineParam) {
      return NextResponse.json(
        { error: "Parameter 'line' wajib diisi" },
        { status: 400 }
      );
    }

    const line = lineParam.trim().toUpperCase();
    const baseYmd = getShiftBaseYmdJakarta();

    const pool = await getSqlPool();

    /**
     * TARGET:
     * - dari PRODPLAN_MIRROR
     * - model = KANBAN (seperti semula)
     *
     * ACTUAL:
     * - dari TPN0007_201
     * - model = I_DRW_NO
     * - skip NULL / kosong (tidak dimunculkan)
     * - qty = SUM(I_ACP_QTY)
     */
    const result = await pool
      .request()
      .input("D_YMD", baseYmd)
      .input("LINE", line)
      .query(`
        WITH PlanModel AS (
          SELECT
            model = LTRIM(RTRIM(KANBAN)),
            target = SUM(QTY)
          FROM dbo.TBL_R_PRODPLAN_MIRROR
          WHERE D_YMD = @D_YMD
            AND UPPER(LTRIM(RTRIM(SETSUBICD))) = @LINE
            AND NULLIF(LTRIM(RTRIM(KANBAN)), '') IS NOT NULL
          GROUP BY LTRIM(RTRIM(KANBAN))
        ),
        ResultModel AS (
          SELECT
            model = LTRIM(RTRIM(I_DRW_NO)),
            actual = SUM(CAST(I_ACP_QTY AS bigint))
          FROM dbo.TPN0007_201
          WHERE I_ACP_DATE = @D_YMD
            AND UPPER(LTRIM(RTRIM(I_IND_DEST_CD))) = @LINE
            AND NULLIF(LTRIM(RTRIM(I_DRW_NO)), '') IS NOT NULL
          GROUP BY LTRIM(RTRIM(I_DRW_NO))
        )
        SELECT
          COALESCE(r.model, p.model) AS model,
          ISNULL(p.target, 0) AS target,
          ISNULL(r.actual, 0) AS actual
        FROM ResultModel r
        FULL OUTER JOIN PlanModel p
          ON p.model = r.model
        -- biar yg kosong gak keikut walaupun join
        WHERE COALESCE(r.model, p.model) IS NOT NULL
        ORDER BY ISNULL(r.actual, 0) DESC, COALESCE(r.model, p.model) ASC;
      `);

    return NextResponse.json(result.recordset ?? []);
  } catch (err: any) {
    console.error("API Models Error:", err);
    return NextResponse.json(
      { error: err.message || "Database Error" },
      { status: 500 }
    );
  }
}
