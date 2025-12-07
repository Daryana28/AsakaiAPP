// asakai-dashboard/app/api/dashboard/route.ts
import { NextResponse } from "next/server";
import { getSqlPool } from "@/lib/mssql";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tglParam = url.searchParams.get("tgl");

    const now = new Date();
    const today =
      now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0");

    const tgl = tglParam || today;

    const pool = await getSqlPool();

    const result = await pool.request().input("tgl", tgl).query(`
        SELECT
          dept,
          SUM(qty_seihan) AS target_qty,
          SUM(qty_aktual) AS actual_qty
        FROM dbo.t_gth_assy
        WHERE tgl = @tgl
        GROUP BY dept
      `);

    return NextResponse.json(result.recordset);
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || "DB error" },
      { status: 500 }
    );
  }
}
