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
  options: { encrypt: false, trustServerCertificate: true },
};

// Helper tanggal "YYYYMMDD"
function getTodayYmd() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

const toStr = (v) => (v === null || v === undefined ? null : String(v));
const toNum = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/* ==========================================================
 *  1) SYNC RESULT: Oracle PN0007.TPN0007_201 -> SQL dbo.TPN0007_201
 * ==========================================================*/
async function syncProdresultOnce(oconn, pool, today) {
  console.log("→ Sync PRODRESULT (TPN0007_201)");

  // Query Oracle: ambil semua kolom penting sesuai tabel SQL kamu
  const query = `
    SELECT
      I_FAC_CD,
      I_ACP_DATE,
      I_SHIFT,
      I_ST_TIME,
      I_ED_TIME,
      I_DATACODE,
      I_IND_DEST_CD,
      I_IND_CONTENT,
      I_ITEM_CD,
      I_ITEM_DESC,
      I_DRW_NO,
      I_ACP_QTY,
      I_WK_SEC,
      I_WK_TIME,
      I_SETUP_SEC,
      I_SETUP_TIME,
      DOUJI,
      KANSEIKBN,
      NAOSI,
      SIJIBI,
      HURIKAE,
      SEKININ,
      I_RJT_REASON_CD,
      I_RJT_QTY,
      MANCNT,
      COL_PTN,
      INSDATE,
      UPDDATE
    FROM PN0007.TPN0007_201
    WHERE I_ACP_DATE = :today
  `;

  const result = await oconn.execute(
    query,
    { today },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  const rows = result.rows || [];
  console.log("  Jumlah baris TPN0007_201 (hari ini):", rows.length);
  if (!rows.length) return;

  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    for (const r of rows) {
      await new sql.Request(tx)
        // ===== keys / identity fields =====
        .input("I_FAC_CD", sql.NVarChar(20), toStr(r.I_FAC_CD))
        .input("I_ACP_DATE", sql.VarChar(8), toStr(r.I_ACP_DATE))
        .input("I_SHIFT", sql.Int, toNum(r.I_SHIFT))
        .input("I_ST_TIME", sql.VarChar(6), toStr(r.I_ST_TIME))
        .input("I_ITEM_CD", sql.NVarChar(50), toStr(r.I_ITEM_CD))
        .input("I_DRW_NO", sql.NVarChar(50), toStr(r.I_DRW_NO))

        // ===== other fields =====
        .input("I_ED_TIME", sql.VarChar(6), toStr(r.I_ED_TIME))
        .input("I_DATACODE", sql.NVarChar(20), toStr(r.I_DATACODE))
        .input("I_IND_DEST_CD", sql.NVarChar(20), toStr(r.I_IND_DEST_CD))
        .input("I_IND_CONTENT", sql.NVarChar(200), toStr(r.I_IND_CONTENT))
        .input("I_ITEM_DESC", sql.NVarChar(200), toStr(r.I_ITEM_DESC))
        .input("I_ACP_QTY", sql.Int, toNum(r.I_ACP_QTY))
        .input("I_WK_SEC", sql.Int, toNum(r.I_WK_SEC))
        .input("I_WK_TIME", sql.Decimal(18, 2), toNum(r.I_WK_TIME))
        .input("I_SETUP_SEC", sql.Int, toNum(r.I_SETUP_SEC))
        .input("I_SETUP_TIME", sql.Decimal(18, 2), toNum(r.I_SETUP_TIME))

        .input("DOUJI", sql.Int, toNum(r.DOUJI))
        .input("KANSEIKBN", sql.NVarChar(50), toStr(r.KANSEIKBN))
        .input("NAOSI", sql.NVarChar(50), toStr(r.NAOSI))
        .input("SIJIBI", sql.NVarChar(50), toStr(r.SIJIBI))
        .input("HURIKAE", sql.NVarChar(50), toStr(r.HURIKAE))
        .input("SEKININ", sql.NVarChar(50), toStr(r.SEKININ))

        .input("I_RJT_REASON_CD", sql.NVarChar(50), toStr(r.I_RJT_REASON_CD))
        .input("I_RJT_QTY", sql.Int, toNum(r.I_RJT_QTY))
        .input("MANCNT", sql.Int, toNum(r.MANCNT))
        .input("COL_PTN", sql.Int, toNum(r.COL_PTN))

        .input("INSDATE", sql.DateTime2, r.INSDATE ? new Date(r.INSDATE) : null)
        .input("UPDDATE", sql.DateTime2, r.UPDDATE ? new Date(r.UPDDATE) : null)

        .query(`
          -- NOTE: PROC adalah keyword, jadi di SQL Server wajib [PROC]
          IF NOT EXISTS (
            SELECT 1
            FROM dbo.TPN0007_201
            WHERE I_FAC_CD  = @I_FAC_CD
              AND I_ACP_DATE = @I_ACP_DATE
              AND I_SHIFT    = @I_SHIFT
              AND I_ST_TIME  = @I_ST_TIME
              AND ISNULL(I_ITEM_CD,'') = ISNULL(@I_ITEM_CD,'')
              AND ISNULL(I_DRW_NO,'')  = ISNULL(@I_DRW_NO,'')
          )
          BEGIN
            INSERT INTO dbo.TPN0007_201 (
              I_FAC_CD, I_ACP_DATE, I_SHIFT, I_ST_TIME, I_ED_TIME, I_DATACODE,
              I_IND_DEST_CD, I_IND_CONTENT, I_ITEM_CD, I_ITEM_DESC, I_DRW_NO,
              I_ACP_QTY, I_WK_SEC, I_WK_TIME, I_SETUP_SEC, I_SETUP_TIME,
              DOUJI, KANSEIKBN, NAOSI, SIJIBI, HURIKAE, SEKININ,
              I_RJT_REASON_CD, I_RJT_QTY, MANCNT, COL_PTN,
              INSDATE, UPDDATE,
              _synced_at
            )
            VALUES (
              @I_FAC_CD, @I_ACP_DATE, @I_SHIFT, @I_ST_TIME, @I_ED_TIME, @I_DATACODE,
              @I_IND_DEST_CD, @I_IND_CONTENT, @I_ITEM_CD, @I_ITEM_DESC, @I_DRW_NO,
              @I_ACP_QTY, @I_WK_SEC, @I_WK_TIME, @I_SETUP_SEC, @I_SETUP_TIME,
              @DOUJI, @KANSEIKBN, @NAOSI, @SIJIBI, @HURIKAE, @SEKININ,
              @I_RJT_REASON_CD, @I_RJT_QTY, @MANCNT, @COL_PTN,
              @INSDATE, @UPDDATE,
              SYSDATETIME()
            );
          END
          ELSE
          BEGIN
            UPDATE dbo.TPN0007_201
            SET
              I_ED_TIME = @I_ED_TIME,
              I_DATACODE = @I_DATACODE,
              I_IND_DEST_CD = @I_IND_DEST_CD,
              I_IND_CONTENT = @I_IND_CONTENT,
              I_ITEM_DESC = @I_ITEM_DESC,
              I_ACP_QTY = @I_ACP_QTY,
              I_WK_SEC = @I_WK_SEC,
              I_WK_TIME = @I_WK_TIME,
              I_SETUP_SEC = @I_SETUP_SEC,
              I_SETUP_TIME = @I_SETUP_TIME,
              DOUJI = @DOUJI,
              KANSEIKBN = @KANSEIKBN,
              NAOSI = @NAOSI,
              SIJIBI = @SIJIBI,
              HURIKAE = @HURIKAE,
              SEKININ = @SEKININ,
              I_RJT_REASON_CD = @I_RJT_REASON_CD,
              I_RJT_QTY = @I_RJT_QTY,
              MANCNT = @MANCNT,
              COL_PTN = @COL_PTN,
              INSDATE = @INSDATE,
              UPDDATE = @UPDDATE,
              _synced_at = SYSDATETIME()
            WHERE I_FAC_CD  = @I_FAC_CD
              AND I_ACP_DATE = @I_ACP_DATE
              AND I_SHIFT    = @I_SHIFT
              AND I_ST_TIME  = @I_ST_TIME
              AND ISNULL(I_ITEM_CD,'') = ISNULL(@I_ITEM_CD,'')
              AND ISNULL(I_DRW_NO,'')  = ISNULL(@I_DRW_NO,'');
          END
        `);
    }

    await tx.commit();
    console.log("  ✅ TPN0007_201 upsert OK");
  } catch (err) {
    await tx.rollback();
    console.error("  ❌ ERROR TPN0007_201:", err);
  }
}

/* ============================================
 *  2) SYNC PLAN / TARGET (TBL_R_PRODPLAN)
 *  (TETAP - jangan diubah)
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
  console.log(`\n=== SYNC HARI INI (${today}) → TPN0007_201 & PRODPLAN ===`);

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

syncAll();
setInterval(syncAll, 60_000);
