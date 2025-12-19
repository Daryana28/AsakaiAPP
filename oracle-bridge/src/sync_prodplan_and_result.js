// oracle-bridge/src/sync_prodplan_and_result.js
require("dotenv").config();

const oracledb = require("oracledb");
const sql = require("mssql");

/* ================== ENV ================== */
function must(name) {
  const v = (process.env[name] || "").trim();
  if (!v) throw new Error(`ENV ${name} wajib diisi`);
  return v;
}

const oracleConfig = {
  user: must("ORACLE_USER"),
  password: must("ORACLE_PASSWORD"),
  connectString: must("ORACLE_CONNECT"),
};

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

/* ================== UTIL ================== */
const toStr = (v) => (v === null || v === undefined ? null : String(v));
const toNum = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const toDate = (v) => (v ? new Date(v) : null);

// format YYYYMMDD dari timezone Asia/Jakarta
function ymdJakarta(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}`;
}

/* ================== WATERMARK (PAKAI TABLE BARU) ================== */
async function ensureWatermark2(pool) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.SyncWatermark2','U') IS NULL
    BEGIN
      CREATE TABLE dbo.SyncWatermark2 (
        wm_key NVARCHAR(150) NOT NULL PRIMARY KEY,
        last_value DATETIME2 NULL,
        updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
      );
    END
  `);
}

async function getWM(pool, key) {
  const r = await pool
    .request()
    .input("k", sql.NVarChar(150), key)
    .query(`SELECT last_value FROM dbo.SyncWatermark2 WHERE wm_key=@k`);
  return r.recordset[0]?.last_value ?? null;
}

async function setWM(pool, key, val) {
  await pool
    .request()
    .input("k", sql.NVarChar(150), key)
    .input("v", sql.DateTime2, val)
    .query(`
      MERGE dbo.SyncWatermark2 AS t
      USING (SELECT @k AS wm_key, @v AS last_value) s
      ON t.wm_key = s.wm_key
      WHEN MATCHED THEN UPDATE SET last_value=s.last_value, updated_at=SYSDATETIME()
      WHEN NOT MATCHED THEN INSERT (wm_key, last_value) VALUES (s.wm_key, s.last_value);
    `);
}

/* ================== SYNC PRODPLAN (MERGE sesuai UNIQUE INDEX) ==================
   Unique index kamu: UX_Prodplan_Key (FACCD, SETSUBICD, ITEMCD, D_YMD)
*/
async function syncProdPlan(oconn, pool) {
  const today = new Date();
  const from = ymdJakarta(today);
  const toDateObj = new Date(today);
  toDateObj.setDate(toDateObj.getDate() + 30);
  const to = ymdJakarta(toDateObj);

  console.log(`→ Sync PRODPLAN window D_YMD BETWEEN ${from} AND ${to}`);

  const rs = await oconn.execute(
    `
    SELECT
      FACCD,
      GRPCD,
      SETSUBICD,
      ASETSUBICD,
      ITEMCD,
      KANBAN,
      ST,
      D_YMD,
      D_YM,
      D_D,
      QTY
    FROM PN0005.TBL_R_PRODPLAN
    WHERE D_YMD BETWEEN :f AND :t
    `,
    { f: from, t: to },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  const rows = rs.rows || [];
  console.log("  Jumlah baris Oracle PRODPLAN:", rows.length);
  if (!rows.length) return;

  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    for (const r of rows) {
      // oracledb OUT_FORMAT_OBJECT biasanya UPPERCASE key
      const FACCD = toStr(r.FACCD);
      const SETSUBICD = toStr(r.SETSUBICD);
      const ITEMCD = toStr(r.ITEMCD);
      const D_YMD = toStr(r.D_YMD);

      await new sql.Request(tx)
        .input("FACCD", sql.NVarChar(50), FACCD)
        .input("GRPCD", sql.NVarChar(50), toStr(r.GRPCD))
        .input("SETSUBICD", sql.NVarChar(50), SETSUBICD)
        .input("ASETSUBICD", sql.NVarChar(50), toStr(r.ASETSUBICD))
        .input("ITEMCD", sql.NVarChar(50), ITEMCD)
        .input("KANBAN", sql.NVarChar(50), toStr(r.KANBAN))
        .input("ST", sql.Int, toNum(r.ST))
        .input("D_YMD", sql.VarChar(8), D_YMD)
        .input("D_YM", sql.VarChar(6), toStr(r.D_YM))
        .input("D_D", sql.VarChar(2), toStr(r.D_D))
        .input("QTY", sql.Int, toNum(r.QTY))
        .query(`
          MERGE dbo.TBL_R_PRODPLAN_MIRROR AS t
          USING (SELECT 1 AS x) AS s
          ON  t.FACCD = @FACCD
          AND t.SETSUBICD = @SETSUBICD
          AND t.ITEMCD = @ITEMCD
          AND t.D_YMD = @D_YMD
          WHEN MATCHED THEN
            UPDATE SET
              GRPCD=@GRPCD,
              ASETSUBICD=@ASETSUBICD,
              KANBAN=@KANBAN,
              ST=@ST,
              D_YM=@D_YM,
              D_D=@D_D,
              QTY=@QTY
          WHEN NOT MATCHED THEN
            INSERT (FACCD, GRPCD, SETSUBICD, ASETSUBICD, ITEMCD, KANBAN, ST, D_YMD, D_YM, D_D, QTY)
            VALUES (@FACCD, @GRPCD, @SETSUBICD, @ASETSUBICD, @ITEMCD, @KANBAN, @ST, @D_YMD, @D_YM, @D_D, @QTY);
        `);
    }

    await tx.commit();
    console.log(`  ✅ PRODPLAN synced (${rows.length} rows)`);
  } catch (e) {
    await tx.rollback();
    console.error("  ❌ PRODPLAN error:", e);
    throw e;
  }
}

/* ================== SYNC PRODRESULT (INCREMENTAL BY INSDATE) ==================
   Karena UPDDATE di Oracle kamu NULL semua, pakai INSDATE.
   Aman untuk realtime 15 menit.
*/
async function syncProdResult(oconn, pool) {
  const WM_KEY = "ORACLE:PN0007.TPN0007_201:INSDATE";
  const last = await getWM(pool, WM_KEY);

  console.log(`→ Sync PRODRESULT incremental by INSDATE > ${last || "(NULL/first run)"}`);

  // first run: ambil 2 hari terakhir biar gak berat
  const today = ymdJakarta(new Date());
  const yestObj = new Date();
  yestObj.setDate(yestObj.getDate() - 1);
  const yest = ymdJakarta(yestObj);

  const rs = await oconn.execute(
    `
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
      INSDATE
    FROM PN0007.TPN0007_201
    WHERE
      (
        :last IS NOT NULL AND INSDATE IS NOT NULL AND INSDATE > :last
      )
      OR
      (
        :last IS NULL AND I_ACP_DATE IN (:today, :yest)
      )
    ORDER BY INSDATE NULLS LAST
    `,
    { last, today, yest },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  const rows = rs.rows || [];
  console.log("  Jumlah baris Oracle PRODRESULT:", rows.length);
  if (!rows.length) return;

  let maxIns = last;
  for (const r of rows) {
    const ins = toDate(r.INSDATE);
    if (ins && (!maxIns || ins > maxIns)) maxIns = ins;
  }

  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    for (const r of rows) {
      const shift = toNum(r.I_SHIFT) ?? 1;

      await new sql.Request(tx)
        .input("I_FAC_CD", sql.NVarChar(20), toStr(r.I_FAC_CD))
        .input("I_ACP_DATE", sql.VarChar(8), toStr(r.I_ACP_DATE))
        .input("I_SHIFT", sql.Int, shift)
        .input("I_ST_TIME", sql.VarChar(6), toStr(r.I_ST_TIME))
        .input("I_ITEM_CD", sql.NVarChar(50), toStr(r.I_ITEM_CD))
        .input("I_DRW_NO", sql.NVarChar(50), toStr(r.I_DRW_NO))

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

        .query(`
          MERGE dbo.TPN0007_201 AS t
          USING (SELECT 1 AS x) s
          ON  t.I_FAC_CD  = @I_FAC_CD
          AND t.I_ACP_DATE = @I_ACP_DATE
          AND t.I_SHIFT    = @I_SHIFT
          AND t.I_ST_TIME  = @I_ST_TIME
          AND ISNULL(t.I_ITEM_CD,'') = ISNULL(@I_ITEM_CD,'')
          AND ISNULL(t.I_DRW_NO,'')  = ISNULL(@I_DRW_NO,'')
          WHEN MATCHED THEN
            UPDATE SET
              I_ED_TIME=@I_ED_TIME,
              I_DATACODE=@I_DATACODE,
              I_IND_DEST_CD=@I_IND_DEST_CD,
              I_IND_CONTENT=@I_IND_CONTENT,
              I_ITEM_DESC=@I_ITEM_DESC,
              I_ACP_QTY=@I_ACP_QTY,
              I_WK_SEC=@I_WK_SEC,
              I_WK_TIME=@I_WK_TIME,
              I_SETUP_SEC=@I_SETUP_SEC,
              I_SETUP_TIME=@I_SETUP_TIME,
              DOUJI=@DOUJI,
              KANSEIKBN=@KANSEIKBN,
              NAOSI=@NAOSI,
              SIJIBI=@SIJIBI,
              HURIKAE=@HURIKAE,
              SEKININ=@SEKININ,
              I_RJT_REASON_CD=@I_RJT_REASON_CD,
              I_RJT_QTY=@I_RJT_QTY,
              MANCNT=@MANCNT,
              COL_PTN=@COL_PTN,
              INSDATE=@INSDATE,
              _synced_at=SYSDATETIME()
          WHEN NOT MATCHED THEN
            INSERT (
              I_FAC_CD, I_ACP_DATE, I_SHIFT, I_ST_TIME, I_ED_TIME, I_DATACODE,
              I_IND_DEST_CD, I_IND_CONTENT, I_ITEM_CD, I_ITEM_DESC, I_DRW_NO,
              I_ACP_QTY, I_WK_SEC, I_WK_TIME, I_SETUP_SEC, I_SETUP_TIME,
              DOUJI, KANSEIKBN, NAOSI, SIJIBI, HURIKAE, SEKININ,
              I_RJT_REASON_CD, I_RJT_QTY, MANCNT, COL_PTN,
              INSDATE, _synced_at
            )
            VALUES (
              @I_FAC_CD, @I_ACP_DATE, @I_SHIFT, @I_ST_TIME, @I_ED_TIME, @I_DATACODE,
              @I_IND_DEST_CD, @I_IND_CONTENT, @I_ITEM_CD, @I_ITEM_DESC, @I_DRW_NO,
              @I_ACP_QTY, @I_WK_SEC, @I_WK_TIME, @I_SETUP_SEC, @I_SETUP_TIME,
              @DOUJI, @KANSEIKBN, @NAOSI, @SIJIBI, @HURIKAE, @SEKININ,
              @I_RJT_REASON_CD, @I_RJT_QTY, @MANCNT, @COL_PTN,
              @INSDATE, SYSDATETIME()
            );
        `);
    }

    await tx.commit();

    if (maxIns) await setWM(pool, WM_KEY, maxIns);
    console.log(`  ✅ PRODRESULT synced (${rows.length} rows) | watermark=${maxIns || "NULL"}`);
  } catch (e) {
    await tx.rollback();
    console.error("  ❌ PRODRESULT error:", e);
    throw e;
  }
}

/* ================== LOOP (anti overlap) ================== */
let isRunning = false;

async function syncAll() {
  if (isRunning) return;
  isRunning = true;

  console.log(`\n=== SYNC START ${new Date().toISOString()} ===`);

  let oconn;
  let pool;

  try {
    oconn = await oracledb.getConnection(oracleConfig);
    pool = await sql.connect(sqlConfig);

    await ensureWatermark2(pool);

    // plan boleh jalan dulu (1x/bulan), result tiap 15 menit
    await syncProdPlan(oconn, pool);
    await syncProdResult(oconn, pool);

    console.log(`=== SYNC DONE ${new Date().toISOString()} ===`);
  } catch (e) {
    console.error("❌ ERROR SYNC:", e);
  } finally {
    if (oconn) await oconn.close().catch(() => {});
    if (pool) await pool.close().catch(() => {});
    isRunning = false;
  }
}

syncAll();
setInterval(syncAll, 15 * 60 * 1000);
