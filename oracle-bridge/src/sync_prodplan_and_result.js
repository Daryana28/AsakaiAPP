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
};

/* ================== UTIL ================== */
const toStr = (v) => (v == null ? null : String(v));
const toNum = (v) => (v == null ? null : Number(v));
const toDate = (v) => (v ? new Date(v) : null);

/* ================== WATERMARK ================== */
async function ensureWatermark(pool) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.SyncWatermark','U') IS NULL
    CREATE TABLE dbo.SyncWatermark (
      [Key] NVARCHAR(100) PRIMARY KEY,
      LastValue DATETIME2
    )
  `);
}

async function getWM(pool, key) {
  const r = await pool.request()
    .input("k", sql.NVarChar, key)
    .query("SELECT LastValue FROM dbo.SyncWatermark WHERE [Key]=@k");
  return r.recordset[0]?.LastValue ?? null;
}

async function setWM(pool, key, val) {
  await pool.request()
    .input("k", sql.NVarChar, key)
    .input("v", sql.DateTime2, val)
    .query(`
      MERGE dbo.SyncWatermark t
      USING (SELECT @k k, @v v) s
      ON t.[Key]=s.k
      WHEN MATCHED THEN UPDATE SET LastValue=s.v
      WHEN NOT MATCHED THEN INSERT ([Key], LastValue) VALUES (s.k, s.v)
    `);
}

/* ================== SYNC PRODRESULT ================== */
async function syncProdResult(oconn, pool) {
  const WM_KEY = "PN0007.TPN0007_201.UPDDATE";
  const last = await getWM(pool, WM_KEY);

  const rs = await oconn.execute(
    `
    SELECT *
    FROM PN0007.TPN0007_201
    WHERE (:last IS NULL OR UPDDATE > :last)
    ORDER BY UPDDATE
    `,
    { last },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  if (!rs.rows.length) return;

  let maxDate = last;

  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    for (const r of rs.rows) {
      await new sql.Request(tx)
        .input("I_ACP_DATE", sql.VarChar(8), r.I_ACP_DATE)
        .input("I_SHIFT", sql.Int, toNum(r.I_SHIFT))
        .input("I_ST_TIME", sql.VarChar(6), r.I_ST_TIME)
        .input("I_ITEM_CD", sql.VarChar(25), r.I_ITEM_CD)
        .input("I_ACP_QTY", sql.Int, toNum(r.I_ACP_QTY))
        .input("UPDDATE", sql.DateTime2, toDate(r.UPDDATE))
        .query(`
          MERGE dbo.TPN0007_201 t
          USING (SELECT 1 x) s
          ON t.I_ACP_DATE=@I_ACP_DATE
         AND t.I_SHIFT=@I_SHIFT
         AND t.I_ST_TIME=@I_ST_TIME
         AND ISNULL(t.I_ITEM_CD,'')=ISNULL(@I_ITEM_CD,'')
          WHEN MATCHED THEN
            UPDATE SET I_ACP_QTY=@I_ACP_QTY, UPDDATE=@UPDDATE
          WHEN NOT MATCHED THEN
            INSERT (I_ACP_DATE,I_SHIFT,I_ST_TIME,I_ITEM_CD,I_ACP_QTY,UPDDATE)
            VALUES (@I_ACP_DATE,@I_SHIFT,@I_ST_TIME,@I_ITEM_CD,@I_ACP_QTY,@UPDDATE)
        `);

      if (!maxDate || r.UPDDATE > maxDate) maxDate = r.UPDDATE;
    }

    await tx.commit();
    await setWM(pool, WM_KEY, maxDate);
    console.log("✅ PRODRESULT synced");
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

/* ================== SYNC PRODPLAN ================== */
async function syncProdPlan(oconn, pool) {
  const today = new Date();
  const ymdFrom = today.toISOString().slice(0, 10).replace(/-/g, "");
  const ymdTo = new Date(today.setDate(today.getDate() + 30))
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");

  console.log(`→ Sync PRODPLAN window ${ymdFrom} - ${ymdTo}`);

  const rs = await oconn.execute(
    `
    SELECT
      FACCD, GRPCD, SETSUBICD, ASETSUBICD, ITEMCD,
      KANBAN, ST, D_YMD, D_YM, D_D, QTY
    FROM PN0005.TBL_R_PRODPLAN
    WHERE D_YMD BETWEEN :f AND :t
    `,
    { f: ymdFrom, t: ymdTo },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    for (const r of rs.rows) {
      await new sql.Request(tx)
        .input("FACCD", sql.VarChar, r.FACCD)
        .input("GRPCD", sql.VarChar, r.GRPCD)
        .input("SETSUBICD", sql.VarChar, r.SETSUBICD)
        .input("ASETSUBICD", sql.VarChar, r.ASETSUBICD)
        .input("ITEMCD", sql.VarChar, r.ITEMCD)
        .input("KANBAN", sql.VarChar, r.KANBAN)
        .input("ST", sql.Int, toNum(r.ST))
        .input("D_YMD", sql.VarChar(8), r.D_YMD)
        .input("D_YM", sql.VarChar(6), r.D_YM)
        .input("D_D", sql.VarChar(2), r.D_D)
        .input("QTY", sql.Int, toNum(r.QTY))
        .query(`
          DELETE FROM dbo.TBL_R_PRODPLAN_MIRROR
          WHERE FACCD=@FACCD AND KANBAN=@KANBAN AND D_YMD=@D_YMD;

          INSERT INTO dbo.TBL_R_PRODPLAN_MIRROR
          (FACCD,GRPCD,SETSUBICD,ASETSUBICD,ITEMCD,KANBAN,ST,D_YMD,D_YM,D_D,QTY)
          VALUES
          (@FACCD,@GRPCD,@SETSUBICD,@ASETSUBICD,@ITEMCD,@KANBAN,@ST,@D_YMD,@D_YM,@D_D,@QTY);
        `);
    }

    await tx.commit();
    console.log("✅ PRODPLAN synced");
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

/* ================== LOOP ================== */
async function run() {
  const oconn = await oracledb.getConnection(oracleConfig);
  const pool = await sql.connect(sqlConfig);

  try {
    await ensureWatermark(pool);
    await syncProdPlan(oconn, pool);
    await syncProdResult(oconn, pool);
  } finally {
    await oconn.close();
    await pool.close();
  }
}

run();
setInterval(run, 15 * 60 * 1000);
