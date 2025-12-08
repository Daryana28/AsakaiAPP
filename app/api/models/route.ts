import { NextResponse } from "next/server";
import { getSqlPool } from "@/lib/mssql"; 

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const line = searchParams.get("line"); // Ambil parameter ?line=INJ-01

    if (!line) {
      return NextResponse.json({ error: "Parameter 'line' wajib diisi" }, { status: 400 });
    }

    // --- LOGIKA TANGGAL (Sama seperti sebelumnya) ---
    const jakartaDate = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Jakarta",
    });
    const today = jakartaDate.replace(/-/g, ""); // YYYYMMDD

    const pool = await getSqlPool();

    // --- QUERY AMBIL MODEL PER LINE ---
    // Grouping berdasarkan nama Model
    const result = await pool.request()
      .input("tgl", today)
      .input("line", line)
      .query(`
        SELECT 
          model,
          SUM(ISNULL(qty_seihan, 0)) AS target, 
          SUM(ISNULL(qty_aktual, 0)) AS actual
        FROM dbo.t_gth_assy
        WHERE tgl = @tgl AND line = @line
        GROUP BY model
        ORDER BY actual DESC
      `);

    return NextResponse.json(result.recordset);

  } catch (err: any) {
    console.error("API Models Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}