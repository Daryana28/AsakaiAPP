// src/syncGthAssy.ts
import "dotenv/config";
import { queryOracle } from "./oracleClient";
import { getSqlPool } from "./sqlServerClient";

type GthRowFromOracle = {
  TGL: string;
  DEPT: string;
  ZONA: number;
  SHIFT: number;
  SHIFT_LINE: number;
  LINE: string;
  QTY_SEIHAN: number;
  QTY_AKTUAL: number;
};

function todayAsString() {
  const now = new Date();
  return (
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0")
  );
}

async function syncOneDay(tgl: string) {
  console.log("[SYNC] Start for TGL =", tgl);

  const sqlOracle = `
    SELECT
      TGL,
      DEPT,
      ZONA,
      SHIFT,
      SHIFT_LINE,
      LINE,
      QTY_SEIHAN,
      QTY_AKTUAL
    FROM ASAKAI.T_GTH_ASSY_ORA
    WHERE TGL = :tgl
  `;

  const rows = await queryOracle<GthRowFromOracle>(sqlOracle, { tgl });
  console.log("[SYNC] Oracle rows =", rows.length);

  if (rows.length === 0) {
    console.warn("[SYNC] Tidak ada data di Oracle untuk tgl", tgl);
  }

  const pool = await getSqlPool();

  await pool.request().input("tgl", tgl).query(`
    DELETE FROM dbo.t_gth_assy WHERE tgl = @tgl;
  `);

  for (const row of rows) {
    await pool
      .request()
      .input("tgl", row.TGL)
      .input("dept", row.DEPT)
      .input("zona", row.ZONA)
      .input("shift", row.SHIFT)
      .input("shift_line", row.SHIFT_LINE)
      .input("line", row.LINE)
      .input("qty_seihan", row.QTY_SEIHAN)
      .input("qty_aktual", row.QTY_AKTUAL).query(`
        INSERT INTO dbo.t_gth_assy
          (tgl, dept, zona, shift, shift_line, line, qty_seihan, qty_aktual)
        VALUES
          (@tgl, @dept, @zona, @shift, @shift_line, @line, @qty_seihan, @qty_aktual);
      `);
  }

  console.log("[SYNC] Done for TGL =", tgl);
}

/**
 * Entry point
 */
// src/syncGthAssy.ts

async function main() {
  console.log("=== SYNC GTH ASSY START ===");
  console.log("[ENV] ORACLE_CONNECT =", process.env.ORACLE_CONNECT);
  console.log("[ENV] SQLSERVER_DB   =", process.env.SQLSERVER_DB);
  console.log("[ARGV] =", process.argv);

  const tgl = process.argv[2] || todayAsString();
  console.log("[SYNC] Running for TGL =", tgl);

  await syncOneDay(tgl);

  console.log("=== SYNC GTH ASSY DONE ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("[SYNC] ERROR", err);
  process.exit(1);
});
