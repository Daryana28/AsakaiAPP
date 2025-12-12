// app/api/asakai/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSqlPool } from "@/lib/mssql";

export const dynamic = "force-dynamic";

type RouteParams = {
  id: string;
};

// DELETE /api/asakai/:id
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<RouteParams> } // ⬅️ params adalah Promise
) {
  try {
    const { id } = await context.params; // ⬅️ wajib di-await
    const numId = Number(id);

    if (!Number.isFinite(numId)) {
      return NextResponse.json(
        { ok: false, error: "ID tidak valid" },
        { status: 400 }
      );
    }

    const pool = await getSqlPool();

    const result = await pool
      .request()
      .input("id", numId)
      .query(`
        DELETE FROM dbo.t_asakai_upload
        WHERE id = @id
      `);

    // Optional: cek kalau datanya memang ada
    if (!result.rowsAffected || result.rowsAffected[0] === 0) {
      return NextResponse.json(
        { ok: false, error: "Data tidak ditemukan" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Error DELETE /api/asakai/:id =>", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Gagal hapus data" },
      { status: 500 }
    );
  }
}
