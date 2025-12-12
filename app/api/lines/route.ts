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

    // Tanggal hari ini sama seperti di /api/dashboard (YYYYMMDD)
    const now = new Date();
    const today =
      now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0");

    const pool = await getSqlPool();

    const result = await pool
      .request()
      .input("tgl", today)
      .input("dept", dept)
      .query(`
        WITH src AS (
          SELECT
            I_IND_DEST_CD AS line,
            I_ACP_QTY,
            CASE LEFT(I_IND_DEST_CD, 2)
              WHEN '11' THEN 'ASSY'
              WHEN '21' THEN 'ASSY'
              WHEN '12' THEN 'INJECTION'
              WHEN '16' THEN 'INJECTION'
              WHEN '22' THEN 'INJECTION'
              WHEN '13' THEN 'ST'
              WHEN '14' THEN 'ST'
              WHEN '15' THEN 'ST'
              WHEN '23' THEN 'ST'
              WHEN '24' THEN 'ST'
              WHEN '25' THEN 'ST'
              ELSE 'OTHER'
            END AS dept
          FROM HHT_GATHERING_INF_ORA
          WHERE CONVERT(VARCHAR(8), I_ACP_DATE, 112) = @tgl
            AND LEFT(I_IND_DEST_CD, 2) IN 
              ('11','21','12','16','22','13','14','15','23','24','25')
        )
        SELECT
          line,
          -- TARGET = full qty
          SUM(I_ACP_QTY) AS target,
          -- ACTUAL = dikurangi 20% (80% dari target)
          CAST(SUM(I_ACP_QTY) * 0.8 AS INT) AS actual
        FROM src
        WHERE dept = @dept
        GROUP BY line
        ORDER BY line ASC;
      `);

    const data = result.recordset.map((row: any) => {
      const target = row.target as number;
      const actual = row.actual as number;
      const efficiency =
        target > 0 ? parseFloat(((actual / target) * 100).toFixed(1)) : 0;

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
