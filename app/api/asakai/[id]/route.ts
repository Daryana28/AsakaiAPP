// app/api/asakai/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";

// SESUAIKAN dengan konfigurasi kamu
const config: sql.config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
  },
};

let poolPromise: Promise<sql.ConnectionPool> | null = null;

function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config).connect();
  }
  return poolPromise;
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (!id || Number.isNaN(id)) {
    return NextResponse.json(
      { ok: false, error: "ID tidak valid" },
      { status: 400 }
    );
  }

  try {
    const pool = await getPool();

    await pool
      .request()
      .input("id", sql.Int, id)
      .query("DELETE FROM t_asakai_upload WHERE id = @id");

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error DELETE /api/asakai/[id]:", err);
    return NextResponse.json(
      { ok: false, error: "Gagal menghapus di database" },
      { status: 500 }
    );
  }
}
