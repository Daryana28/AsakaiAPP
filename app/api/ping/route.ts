import { NextResponse } from "next/server";
import { getSqlPool } from "@/lib/mssql";

export async function GET() {
  try {
    const pool = await getSqlPool();

    const result = await pool
      .request()
      .query("SELECT TOP 10 * FROM dbo.t_gth_assy ORDER BY id DESC");

    return NextResponse.json(result.recordset);
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || "DB error" },
      { status: 500 }
    );
  }
}
