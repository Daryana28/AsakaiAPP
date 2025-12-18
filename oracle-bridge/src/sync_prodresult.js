// oracle-bridge/src/sync_prodresult.js
require("dotenv").config();

const oracledb = require("oracledb");
const sql = require("mssql");

// ================== VALIDASI ENV (WAJIB) ==================
function must(name) {
  const v = (process.env[name] || "").trim();
  if (!v) throw new Error(`ENV ${name} wajib diisi`);
  return v;
}

// ================== KONFIG ORACLE ==================
const oracleConfig = {
  user: must("ORACLE_USER"),
  password: must("ORACLE_PASSWORD"),
  connectString: must("ORACLE_CONNECT"),
};

// ================== KONFIG SQL SERVER ==============
const sqlConfig = {
  user: must("SQLSERVER_USER"),
  password: must("SQLSERVER_PASSWORD"),
  server: must("SQLSERVER_SERVER"),
  database: must("SQLSERVER_DB"),
  options: { encrypt: false, trustServerCertificate: true },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
  requestTimeout: 120_000,
  connectionTimeout: 30_000,
};

// ================== UTIL TANGGAL (JAKARTA, TANPA SHIFT) ==================
function getTodayYmdJakarta() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}`; // YYYYMMDD
}

function prevYmdFrom(ymd) {
  const dt = new Date(
    Number(ymd.slice(0, 4)),
    Number(ymd.slice(4, 6)) - 1,
    Number(ymd.slice(6, 8))
  );
  dt.setDate(dt.getDate() - 1);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

// ================== NORMALIZER ==================
const toStr = (v) => (v === null || v === undefined ? null : String(v));
const toNum = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const toDate = (v) => (v ? new Date(v) : null);

/* ==========================================================
 *  SYNC RESULT: Oracle PN0007.TPN0007_201 -> SQL dbo.TPN0007_201
 *  - Ambil hanya berdasarkan I_ACP_DATE (hari ini + kemarin)
 *  - Tidak ada opsi shift. Tetapi I_SHIFT tetap diisi (DB NOT NULL)
 * ==========================================================*/
async function syncProdresultOnce(oconn, pool, d0, d1) {
  console.log(`→ Sync PRODRESULT | I_ACP_DATE IN (${d0}, ${d1})`);

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
    WHERE I_ACP_DATE = :d0 OR I_ACP_DATE = :d1
  `;

  const result = await oconn.execute(
    query,
    { d0, d1 },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  const rows = result.rows || [];
  console.log("  Jumlah baris Oracle:", rows.length);
  if (!rows.length) return;

  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    for (const r of rows) {
      // DB SQL Anda NOT NULL untuk I_SHIFT → wajib ada value
      const shift = toNum(r.I_SHIFT);
      if (shift == null) {
        console.warn("  ⚠️ WARN: I_SHIFT NULL, fallback=1", {
          I_FAC_CD: r.I_FAC_CD,
          I_ACP_DATE: r.I_ACP_DATE,
          I_ST_TIME: r.I_ST_TIME,
          I_ITEM_CD: r.I_ITEM_CD,
          I_DRW_NO: r.I_DRW_NO,
        });
      }

      await new sql.Request(tx)
        // ===== keys / identity fields =====
        .input("I_FAC_CD", sql.NVarChar(20), toStr(r.I_FAC_CD))
        .input("I_ACP_DATE", sql.VarChar(8), toStr(r.I_ACP_DATE))
        .input("I_SHIFT", sql.Int, shift ?? 1) // ✅ wajib
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

        .input("INSDATE", sql.DateTime2, toDate(r.INSDATE))
        .input("UPDDATE", sql.DateTime2, toDate(r.UPDDATE))

        .query(`
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
    console.log("  ✅ PRODRESULT sync OK");
  } catch (err) {
    await tx.rollback();
    console.error("  ❌ PRODRESULT error:", err);
  }
}

// ================= LOOP UNTUK PM2 =================
let isRunning = false;

async function syncAll() {
  if (isRunning) return;
  isRunning = true;

  const today = getTodayYmdJakarta();
  const yesterday = prevYmdFrom(today);

  console.log(`\n=== SYNC I_ACP_DATE (${today}, ${yesterday}) ===`);

  let oconn;
  let pool;

  try {
    oconn = await oracledb.getConnection(oracleConfig);
    pool = await sql.connect(sqlConfig);

    await syncProdresultOnce(oconn, pool, today, yesterday);
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
