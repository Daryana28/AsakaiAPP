// app/api/asakai-list/route.ts
import { NextResponse } from "next/server";
import { getSqlPool } from "@/lib/mssql";

export const dynamic = "force-dynamic";

/** ✅ micro-cache 15 detik (in-memory) */
type CacheItem = { exp: number; value: any };
const CACHE_TTL_MS = 15_000;
let cache: CacheItem | null = null;

export async function GET() {
  try {
    const now = Date.now();

    // ✅ serve dari cache kalau masih valid
    if (cache && cache.exp > now) {
      return NextResponse.json(cache.value);
    }

    const pool = await getSqlPool();

    const result = await pool.request().query(`
      SET NOCOUNT ON;

      SELECT TOP 8
        id,
        dept,
        file_name,
        file_path,
        cover_name,
        cover_path,
        uploaded_at
      FROM dbo.t_asakai_upload
      ORDER BY uploaded_at DESC;
    `);

    const rows = result.recordset ?? [];

    // ✅ simpan cache
    cache = { exp: now + CACHE_TTL_MS, value: rows };

    return NextResponse.json(rows);
  } catch (err: any) {
    console.error("API /api/asakai-list error:", err);
    return NextResponse.json(
      { error: err.message || "DB error" },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}
