import { NextResponse } from "next/server";
// Pastikan path import ini sesuai dengan file koneksi database Anda
// Jika menggunakan file 'lib/db.ts' yang saya buat sebelumnya, sesuaikan import-nya.
// Disini saya biarkan sesuai snippet Anda (menggunakan lib/mssql).
import { getSqlPool } from "@/lib/mssql"; 

export const dynamic = "force-dynamic"; // Tambahkan ini agar tidak di-cache oleh Next.js

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
          -- Sesuaikan alias kolom agar sama dengan tipe data di Frontend (DashboardRow)
          SUM(qty_seihan) AS qty_seihan, 
          SUM(qty_aktual) AS qty_aktual
        FROM dbo.t_gth_assy
        WHERE tgl = @tgl
        GROUP BY dept
      `);

    return NextResponse.json(result.recordset);
  } catch (err: any) {
    console.error("API Error:", err);
    return NextResponse.json(
      { error: err.message || "DB error" },
      { status: 500 }
    );
  }
}