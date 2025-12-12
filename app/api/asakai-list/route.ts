import { NextResponse } from "next/server";
import { getSqlPool } from "@/lib/mssql";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const pool = await getSqlPool();

    const result = await pool.request().query(`
      SELECT TOP 8
        id,
        dept,
        file_name,
        file_path,
        cover_name,
        cover_path,
        uploaded_at
      FROM dbo.t_asakai_upload
      ORDER BY uploaded_at DESC
    `);

    return NextResponse.json(result.recordset);
  } catch (err: any) {
    console.error("API /api/asakai-list error:", err);
    return NextResponse.json(
      { error: err.message || "DB error" },
      { status: 500 }
    );
  }
}

// optional, biar OPTIONS / preflight tidak bikin error kalau ada
export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}
