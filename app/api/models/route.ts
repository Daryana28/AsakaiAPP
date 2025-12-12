import { NextResponse } from "next/server";
import { getSqlPool } from "@/lib/mssql";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const line = searchParams.get("line"); // ?line=11HA dll

    if (!line) {
      return NextResponse.json(
        { error: "Parameter 'line' wajib diisi" },
        { status: 400 }
      );
    }

    // Tanggal hari ini di zona waktu Jakarta
    const jakartaDate = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Jakarta",
    });
    const today = jakartaDate.replace(/-/g, ""); // YYYYMMDD

    const pool = await getSqlPool();

const result = await pool
  .request()
  .input("tgl", today)
  .input("line", line)
  .query(`
    SELECT 
      I_ITEM_DESC AS model,

      -- TARGET = FULL QTY (100%)
      SUM(ISNULL(I_ACP_QTY, 0)) AS target,

      -- ACTUAL = 80% DARI TARGET (DIKURANGI 20%)
      CAST(SUM(ISNULL(I_ACP_QTY, 0)) * 0.8 AS INT) AS actual

    FROM dbo.HHT_GATHERING_INF_ORA
    WHERE CONVERT(VARCHAR(8), I_ACP_DATE, 112) = @tgl
      AND I_IND_DEST_CD = @line
    GROUP BY I_ITEM_DESC
    ORDER BY actual DESC
  `);


    return NextResponse.json(result.recordset);
  } catch (err: any) {
    console.error("API Models Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
