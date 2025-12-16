// app/api/dashboard/route.ts
import { NextResponse } from "next/server";
import sql from "mssql";

export const dynamic = "force-dynamic";

const sqlServerConfig: sql.config = {
  user: process.env.SQLSERVER_USER || "appAsakai",
  password: process.env.SQLSERVER_PASSWORD || "W3d4ng4ns0l0",
  server: process.env.SQLSERVER_SERVER || "172.17.100.9",
  database: process.env.SQLSERVER_DB || "Asakai",

  // ✅ anti-timeout
  requestTimeout: 60000,
  connectionTimeout: 30000,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },

  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

/* ===============================
   ✅ CACHED POOL (PENTING)
   =============================== */
let _pool: sql.ConnectionPool | null = null;
let _poolPromise: Promise<sql.ConnectionPool> | null = null;

async function getPool() {
  if (_pool) return _pool;

  if (!_poolPromise) {
    _poolPromise = sql.connect(sqlServerConfig).then((p) => {
      _pool = p;

      // kalau koneksi putus/error, reset biar bisa reconnect
      p.on("error", () => {
        _pool = null;
        _poolPromise = null;
      });

      return p;
    });
  }

  return _poolPromise;
}

/* ===============================
   MAPPING DEPARTEMEN
   =============================== */

// PLAN → pakai SETSUBICD
const DEPT_CASE_PLAN = `
  CASE
    WHEN LEFT(SETSUBICD, 2) IN ('12','16','22') THEN 'INJECTION'
    WHEN LEFT(SETSUBICD, 2) IN ('13','14','15','23','24','25') THEN 'ST'
    WHEN LEFT(SETSUBICD, 2) IN ('11','21') THEN 'ASSY'
    ELSE NULL
  END
`;

// RESULT → pakai I_IND_DEST_CD
const DEPT_CASE_RESULT = `
  CASE
    WHEN LEFT(I_IND_DEST_CD, 2) IN ('12','16','22') THEN 'INJECTION'
    WHEN LEFT(I_IND_DEST_CD, 2) IN ('13','14','15','23','24','25') THEN 'ST'
    WHEN LEFT(I_IND_DEST_CD, 2) IN ('11','21') THEN 'ASSY'
    ELSE NULL
  END
`;

/* ===============================
   SHIFT & BASE DATE (server time)
   =============================== */
function toYmd(dt: Date) {
  return `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(
    2,
    "0"
  )}${String(dt.getDate()).padStart(2, "0")}`;
}

function getShiftBaseYmd() {
  const now = new Date();
  const hour = now.getHours();

  let shift: 1 | 2;
  const baseDate = new Date(now);

  if (hour >= 8 && hour < 20) {
    shift = 1;
  } else if (hour >= 20) {
    shift = 2;
  } else {
    // 00:00–07:59 dianggap shift 2 tapi base date = kemarin
    shift = 2;
    baseDate.setDate(baseDate.getDate() - 1);
  }

  return { shift, baseYmd: toYmd(baseDate) };
}

function prevYmdFrom(ymd: string) {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(4, 6)) - 1;
  const d = Number(ymd.slice(6, 8));
  const dt = new Date(y, m, d);
  dt.setDate(dt.getDate() - 1);
  return toYmd(dt);
}

/* ===============================
   API
   =============================== */
export async function GET(req: Request) {
  try {
    const pool = await getPool();

    const { shift, baseYmd } = getShiftBaseYmd();
    const yesterdayYmd = prevYmdFrom(baseYmd);

    const { searchParams } = new URL(req.url);
    const view = (searchParams.get("view") || "current").toLowerCase() as
      | "current"
      | "yesterday";

    const selectedYmd = view === "yesterday" ? yesterdayYmd : baseYmd;

    const result = await pool
      .request()
      .input("YMD", sql.VarChar(8), selectedYmd)
      .query(`
        WITH
        PlanDept AS (
          SELECT
            ${DEPT_CASE_PLAN} AS dept,
            SUM(CAST(QTY AS BIGINT)) AS qty_seihan
          FROM dbo.TBL_R_PRODPLAN_MIRROR
          WHERE D_YMD = @YMD
            AND ${DEPT_CASE_PLAN} IS NOT NULL
          GROUP BY ${DEPT_CASE_PLAN}
        ),
        ResultDept AS (
          SELECT
            ${DEPT_CASE_RESULT} AS dept,
            SUM(CAST(I_ACP_QTY AS BIGINT)) AS qty_aktual
          FROM dbo.TPN0007_201
          WHERE I_ACP_DATE = @YMD
            AND I_IND_DEST_CD IS NOT NULL
            AND LTRIM(RTRIM(I_IND_DEST_CD)) <> ''
            AND ${DEPT_CASE_RESULT} IS NOT NULL
          GROUP BY ${DEPT_CASE_RESULT}
        )
        SELECT
          COALESCE(p.dept, r.dept) AS dept,
          ISNULL(p.qty_seihan, 0)  AS qty_seihan,
          ISNULL(r.qty_aktual, 0)  AS qty_aktual
        FROM PlanDept p
        FULL OUTER JOIN ResultDept r
          ON p.dept = r.dept
        ORDER BY dept;
      `);

    return NextResponse.json({
      shift,
      baseYmd,
      yesterdayYmd,
      selectedYmd,
      view,
      rows: result.recordset ?? [],
    });
  } catch (err) {
    console.error("ERROR /api/dashboard:", err);
    return NextResponse.json(
      { error: "db-error", detail: String(err) },
      { status: 500 }
    );
  }
}
