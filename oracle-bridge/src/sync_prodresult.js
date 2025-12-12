// oracle-bridge/src/sync_prodresult.js
require("dotenv").config();

const oracledb = require("oracledb");
const sql = require("mssql");

// ================== KONFIG ORACLE ==================
const oracleConfig = {
  user: process.env.ORACLE_USER || "APP_READONLY",
  password: process.env.ORACLE_PASSWORD || "W3d4ng4ns0l0",
  connectString: process.env.ORACLE_CONNECT || "172.17.100.17:1521/PIKUNI",
};

// ================== KONFIG SQL SERVER ==============
const sqlConfig = {
  user: process.env.SQLSERVER_USER || "appAsakai",
  password: process.env.SQLSERVER_PASSWORD || "W3d4ng4ns0l0",
  server: process.env.SQLSERVER_SERVER || "172.17.100.9",
  database: process.env.SQLSERVER_DB || "Asakai",
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

// Helper tanggal "YYYYMMDD"
function getTodayYmd() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/* ============================================
 *  1) SYNC HASIL PRODUKSI (TBL_R_PRODRESULT)
 * ==========================================*/
async function syncProdresultOnce(oconn, pool, today) {
  console.log("→ Sync PRODRESULT (hasil produksi)");

  const query = `
    SELECT
      FACCD,
      SETSUBICD,
      ACPNO,
      ITEMCD,
      ITEMDESC,
      KANBAN,
      CMPQTY,
      ST,
      WORKTIME,
      SETUPTIME,
      RJTQTY,
      D_YMD,
      D_YM,
      D_D
    FROM PN0005.TBL_R_PRODRESULT
    WHERE D_YMD = :today
  `;

  const result = await oconn.execute(
    query,
    { today },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  const rows = result.rows || [];
  console.log("  Jumlah baris PRODRESULT (hari ini):", rows.length);
  if (!rows.length) return;

  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    for (const r of rows) {
      const dymd = String(r.D_YMD).replace(/,/g, "");
      const dym = String(r.D_YM).replace(/,/g, "");
      const dd = String(r.D_D).replace(/,/g, "");

      await new sql.Request(tx)
        .input("FACCD", sql.NVarChar(10), r.FACCD)
        .input("SETSUBICD", sql.NVarChar(20), r.SETSUBICD)
        .input("ACPNO", sql.NVarChar(50), r.ACPNO)
        .input("ITEMCD", sql.NVarChar(50), r.ITEMCD)
        .input("ITEMDESC", sql.NVarChar(200), r.ITEMDESC)
        .input("KANBAN", sql.NVarChar(50), r.KANBAN)
        .input("CMPQTY", sql.Int, r.CMPQTY)
        .input("ST", sql.Decimal(10, 2), r.ST)
        .input("WORKTIME", sql.Decimal(10, 2), r.WORKTIME)
        .input("SETUPTIME", sql.Decimal(10, 2), r.SETUPTIME)
        .input("RJTQTY", sql.Int, r.RJTQTY)
        .input("D_YMD", sql.VarChar(8), dymd)
        .input("D_YM", sql.VarChar(6), dym)
        .input("D_D", sql.VarChar(2), dd)
        .query(`
          IF NOT EXISTS (
            SELECT 1 FROM dbo.TBL_R_PRODRESULT_MIRROR
            WHERE FACCD     = @FACCD
              AND SETSUBICD = @SETSUBICD
              AND ITEMCD    = @ITEMCD
              AND D_YMD     = @D_YMD
          )
          BEGIN
            INSERT INTO dbo.TBL_R_PRODRESULT_MIRROR
              (FACCD, SETSUBICD, ACPNO,
               ITEMCD, ITEMDESC, KANBAN,
               CMPQTY, ST, WORKTIME, SETUPTIME, RJTQTY,
               D_YMD, D_YM, D_D,
               CreatedAt, UpdatedAt)
            VALUES
              (@FACCD, @SETSUBICD, @ACPNO,
               @ITEMCD, @ITEMDESC, @KANBAN,
               @CMPQTY, @ST, @WORKTIME, @SETUPTIME, @RJTQTY,
               @D_YMD, @D_YM, @D_D,
               SYSDATETIME(), SYSDATETIME());
          END
          ELSE
          BEGIN
            UPDATE dbo.TBL_R_PRODRESULT_MIRROR
            SET ACPNO      = @ACPNO,
                ITEMDESC   = @ITEMDESC,
                KANBAN     = @KANBAN,
                CMPQTY     = @CMPQTY,
                ST         = @ST,
                WORKTIME   = @WORKTIME,
                SETUPTIME  = @SETUPTIME,
                RJTQTY     = @RJTQTY,
                D_YM       = @D_YM,
                D_D        = @D_D,
                UpdatedAt  = SYSDATETIME()
            WHERE FACCD     = @FACCD
              AND SETSUBICD = @SETSUBICD
              AND ITEMCD    = @ITEMCD
              AND D_YMD     = @D_YMD;
          END
        `);
    }

    await tx.commit();
    console.log("  ✅ PRODRESULT mirror OK");
  } catch (err) {
    await tx.rollback();
    console.error("  ❌ ERROR PRODRESULT:", err);
  }
}

/* ============================================
 *  2) SYNC PLAN / TARGET (TBL_R_PRODPLAN)
 * ==========================================*/
async function syncProdplanOnce(oconn, pool, today) {
  console.log("→ Sync PRODPLAN (target produksi)");

  const query = `
    SELECT
      FACCD,
      GRPCD,
      SETSUBICD,
      ITEMCD,
      KANBAN,
      ST,
      D_YMD,
      D_YM,
      D_D,
      QTY
    FROM PN0005.TBL_R_PRODPLAN
    WHERE D_YMD = :today
  `;

  const result = await oconn.execute(
    query,
    { today },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  const rows = result.rows || [];
  console.log("  Jumlah baris PRODPLAN (hari ini):", rows.length);
  if (!rows.length) return;

  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    for (const r of rows) {
      const dymd = String(r.D_YMD).replace(/,/g, "");
      const dym = String(r.D_YM).replace(/,/g, "");
      const dd = String(r.D_D).replace(/,/g, "");

      await new sql.Request(tx)
        .input("FACCD", sql.NVarChar(10), r.FACCD)
        .input("GRPCD", sql.NVarChar(20), r.GRPCD)
        .input("SETSUBICD", sql.NVarChar(20), r.SETSUBICD)
        .input("ITEMCD", sql.NVarChar(50), r.ITEMCD)
        .input("KANBAN", sql.NVarChar(50), r.KANBAN)
        .input("ST", sql.Decimal(10, 2), r.ST)
        .input("D_YMD", sql.VarChar(8), dymd)
        .input("D_YM", sql.VarChar(6), dym)
        .input("D_D", sql.VarChar(2), dd)
        .input("QTY", sql.Int, r.QTY)
        .query(`
          IF NOT EXISTS (
            SELECT 1 FROM dbo.TBL_R_PRODPLAN_MIRROR
            WHERE FACCD     = @FACCD
              AND SETSUBICD = @SETSUBICD
              AND ITEMCD    = @ITEMCD
              AND D_YMD     = @D_YMD
          )
          BEGIN
            INSERT INTO dbo.TBL_R_PRODPLAN_MIRROR
              (FACCD, GRPCD, SETSUBICD,
               ITEMCD, KANBAN, ST,
               D_YMD, D_YM, D_D,
               QTY,
               CreatedAt, UpdatedAt)
            VALUES
              (@FACCD, @GRPCD, @SETSUBICD,
               @ITEMCD, @KANBAN, @ST,
               @D_YMD, @D_YM, @D_D,
               @QTY,
               SYSDATETIME(), SYSDATETIME());
          END
          ELSE
          BEGIN
            UPDATE dbo.TBL_R_PRODPLAN_MIRROR
            SET GRPCD     = @GRPCD,
                KANBAN    = @KANBAN,
                ST        = @ST,
                D_YM      = @D_YM,
                D_D       = @D_D,
                QTY       = @QTY,
                UpdatedAt = SYSDATETIME()
            WHERE FACCD     = @FACCD
              AND SETSUBICD = @SETSUBICD
              AND ITEMCD    = @ITEMCD
              AND D_YMD     = @D_YMD;
          END
        `);
    }

    await tx.commit();
    console.log("  ✅ PRODPLAN mirror OK");
  } catch (err) {
    await tx.rollback();
    console.error("  ❌ ERROR PRODPLAN:", err);
  }
}

/* ============================================
 *  LOOP UNTUK PM2 (1 proses untuk 2 tabel)
 * ==========================================*/
let isRunning = false;

async function syncAll() {
  if (isRunning) return;
  isRunning = true;

  const today = getTodayYmd();
  console.log(`\n=== SYNC HARI INI (${today}) → PRODRESULT & PRODPLAN ===`);

  let oconn;
  let pool;

  try {
    oconn = await oracledb.getConnection(oracleConfig);
    pool = await sql.connect(sqlConfig);

    await syncProdresultOnce(oconn, pool, today);
    await syncProdplanOnce(oconn, pool, today);
  } catch (err) {
    console.error("❌ ERROR SYNC ALL:", err);
  } finally {
    if (oconn) await oconn.close().catch(() => {});
    if (pool) await pool.close().catch(() => {});
    isRunning = false;
  }
}

// jalan pertama kali + interval 60 detik
syncAll();
setInterval(syncAll, 60_000);
