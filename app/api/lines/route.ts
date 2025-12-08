import { NextResponse } from "next/server";
import { getSqlPool } from "@/lib/mssql";

export const dynamic = "force-dynamic";

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

    // --- PERBAIKAN TIMEZONE ---
    // Mengambil tanggal hari ini khusus zona waktu Jakarta (WIB)
    // Format en-CA menghasilkan: YYYY-MM-DD
    const jakartaDate = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Jakarta",
    });
    // Hapus tanda strip (-) agar menjadi YYYYMMDD
    const today = jakartaDate.replace(/-/g, "");

    const pool = await getSqlPool();

    // --- PERBAIKAN QUERY (Null Handling) ---
    // Tambahkan ISNULL(..., 0) agar database langsung kirim angka 0 jika data null
    const result = await pool
      .request()
      .input("tgl", today)
      .input("dept", dept)
      .query(`
        SELECT 
          line,
          SUM(ISNULL(qty_seihan, 0)) AS target, 
          SUM(ISNULL(qty_aktual, 0)) AS actual
        FROM dbo.t_gth_assy
        WHERE tgl = @tgl AND dept = @dept
        GROUP BY line
        ORDER BY line ASC
      `);

    const data = result.recordset.map((row: any) => {
      // Hitung efisiensi
      const target = row.target;
      const actual = row.actual;
      
      // Cegah pembagian dengan nol
      const efficiency = target > 0 
        ? parseFloat(((actual / target) * 100).toFixed(1)) 
        : 0;

      return {
        line: row.line,
        target,
        actual,
        efficiency,
      };
    });

    return NextResponse.json(data);

  } catch (err: any) {
    console.error("API Lines Error:", err);
    return NextResponse.json(
      { error: err.message || "Database Error" },
      { status: 500 }
    );
  }
}