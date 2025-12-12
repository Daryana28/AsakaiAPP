// oracle-bridge/src/sync-101.js
require('dotenv').config();

const oracledb = require('oracledb');
const sql = require('mssql');

// ================== KONFIG ORACLE ==================
const oracleConfig = {
  user: process.env.ORACLE_USER || 'APP_READONLY',
  password: process.env.ORACLE_PASSWORD || '*****',
  connectString: process.env.ORACLE_CONNECT || '172.17.100.17:1521/PIKUNI',
};

// ================== KONFIG SQL SERVER ==============
const sqlConfig = {
  user: process.env.SQLSERVER_USER || 'appAsakai',
  password: process.env.SQLSERVER_PASSWORD || '*****',
  server: process.env.SQLSERVER_SERVER || '172.17.100.9',
  database: process.env.SQLSERVER_DB || 'Asakai',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

async function sync101() {
  let oconn;
  let spool;

  try {
    console.log('\n=== SYNC TPN0007_101 → SQL MIRROR ===');

    // 1. Connect ke Oracle & SQL Server
    oconn = await oracledb.getConnection(oracleConfig);
    spool = await sql.connect(sqlConfig);

    // 2. Ambil SEMUA data dari Oracle
    const result = await oconn.execute(
      `
      SELECT 
          I_ACP_DATE,
          I_IND_DEST_CD,
          I_ITEM_DESC,
          I_DRW_NO,
          I_ACP_QTY,
          I_WK_TIME
      FROM PN0007.TPN0007_101
      ORDER BY I_ACP_DATE
      `,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const rows = result.rows || [];
    console.log('Jumlah baris Oracle:', rows.length);

    // 3. Transaksi di SQL Server
    const tx = new sql.Transaction(spool);
    await tx.begin();

    try {
      for (const r of rows) {
        // Konversi menit → detik
        let seconds = null;
        if (r.I_WK_TIME !== null && r.I_WK_TIME !== undefined) {
          seconds = Math.round(Number(r.I_WK_TIME) * 60);
        }

        await new sql.Request(tx)
          .input('I_ACP_DATE', sql.Int, r.I_ACP_DATE)
          .input('I_IND_DEST_CD', sql.VarChar(50), r.I_IND_DEST_CD)
          .input('I_ITEM_DESC', sql.NVarChar(300), r.I_ITEM_DESC)
          .input('I_DRW_NO', sql.NVarChar(100), r.I_DRW_NO)
          .input('I_ACP_QTY', sql.Int, r.I_ACP_QTY)
          .input('I_WK_SEC', sql.Int, seconds)
          .query(`
            -- Kalau belum ada kombinasi tanggal + dest + drawing → INSERT
            IF NOT EXISTS (
              SELECT 1
              FROM dbo.TPN0007_101_MIRROR
              WHERE I_ACP_DATE   = @I_ACP_DATE
                AND I_IND_DEST_CD = @I_IND_DEST_CD
                AND I_DRW_NO      = @I_DRW_NO
            )
            BEGIN
              INSERT INTO dbo.TPN0007_101_MIRROR
                (I_ACP_DATE, I_IND_DEST_CD, I_ITEM_DESC, I_DRW_NO, I_ACP_QTY, I_WK_SEC, CreatedAt, UpdatedAt)
              VALUES
                (@I_ACP_DATE, @I_IND_DEST_CD, @I_ITEM_DESC, @I_DRW_NO, @I_ACP_QTY, @I_WK_SEC, SYSDATETIME(), SYSDATETIME());
            END
            ELSE
            BEGIN
              -- Kalau sudah ada → UPDATE qty, detik, dan UpdatedAt
              UPDATE dbo.TPN0007_101_MIRROR
              SET I_ITEM_DESC = @I_ITEM_DESC,
                  I_ACP_QTY   = @I_ACP_QTY,
                  I_WK_SEC    = @I_WK_SEC,
                  UpdatedAt   = SYSDATETIME()
              WHERE I_ACP_DATE    = @I_ACP_DATE
                AND I_IND_DEST_CD = @I_IND_DEST_CD
                AND I_DRW_NO      = @I_DRW_NO;
            END
          `);
      }

      await tx.commit();
      console.log(`✅ Sync selesai — ${rows.length} baris diproses (insert/update).`);
    } catch (err) {
      await tx.rollback();
      console.error('❌ ERROR saat INSERT/UPDATE ke SQL Server:', err);
    }

  } catch (err) {
    console.error('❌ ERROR SYNC:', err);
  } finally {
    if (oconn) await oconn.close().catch(() => {});
    if (spool) await spool.close().catch(() => {});
  }
}

sync101();
