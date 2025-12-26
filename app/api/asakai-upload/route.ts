// app/api/asakai-upload/route.ts
import { NextResponse } from "next/server";
import { getSqlPool } from "@/lib/mssql";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs"; // penting supaya bisa pakai fs

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const dept = formData.get("dept");
    const file = formData.get("file");
    const cover = formData.get("cover");

    // ✅ ambil kpiGroup
    const kpiGroupRaw = formData.get("kpiGroup");
    const kpiGroup =
      typeof kpiGroupRaw === "string" ? kpiGroupRaw.trim() : null;

    // Validasi basic
    if (!dept || typeof dept !== "string") {
      return NextResponse.json(
        { ok: false, message: "dept wajib diisi" },
        { status: 400 }
      );
    }

    // ✅ KPI wajib (biar bisa dikelompokkan)
    if (!kpiGroup) {
      return NextResponse.json(
        { ok: false, message: "kpiGroup wajib diisi" },
        { status: 400 }
      );
    }

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, message: "file utama wajib diisi" },
        { status: 400 }
      );
    }

    // Folder simpan file (misal di /public/uploads/asakai)
    const uploadDir = path.join(process.cwd(), "public", "uploads", "asakai");
    await fs.mkdir(uploadDir, { recursive: true });

    // --- Simpan file utama ---
    const mainBytes = await file.arrayBuffer();
    const mainBuffer = Buffer.from(mainBytes);

    const timeStamp = Date.now();
    const safeMainName = file.name.replace(/[^\w.\-]/g, "_");
    const mainFileName = `${timeStamp}_${safeMainName}`;
    const mainFilePath = path.join(uploadDir, mainFileName);

    await fs.writeFile(mainFilePath, mainBuffer);

    // path yang bisa diakses dari browser (optional)
    const mainPublicPath = `/uploads/asakai/${mainFileName}`;

    // --- Simpan cover (opsional) ---
    let coverName: string | null = null;
    let coverPublicPath: string | null = null;
    let coverSize: number | null = null;

    if (cover && cover instanceof File) {
      const coverBytes = await cover.arrayBuffer();
      const coverBuffer = Buffer.from(coverBytes);

      const safeCoverName = cover.name.replace(/[^\w.\-]/g, "_");
      const coverFileName = `${timeStamp}_cover_${safeCoverName}`;
      const coverFilePath = path.join(uploadDir, coverFileName);

      await fs.writeFile(coverFilePath, coverBuffer);

      coverName = cover.name;
      coverPublicPath = `/uploads/asakai/${coverFileName}`;
      coverSize = cover.size;
    }

    // --- Insert ke database ---
    const pool = await getSqlPool();

    // ✅ pastikan kolom kpi_group ada (auto create kalau belum)
    const colCheck = await pool.request().query(`
      SELECT 1 AS ok
      FROM sys.columns
      WHERE object_id = OBJECT_ID('dbo.t_asakai_upload')
        AND name = 'kpi_group';
    `);
    const hasKpiGroupCol = (colCheck.recordset?.length ?? 0) > 0;

    if (!hasKpiGroupCol) {
      // coba bikin kolom supaya data KPI bisa tersimpan & digroup
      await pool.request().query(`
        ALTER TABLE dbo.t_asakai_upload
        ADD kpi_group NVARCHAR(30) NULL;
      `);
    }

    const reqDb = pool
      .request()
      .input("dept", dept)
      .input("kpi_group", kpiGroup)
      .input("file_name", file.name)
      .input("file_path", mainPublicPath)
      .input("file_size", file.size)
      .input("cover_name", coverName)
      .input("cover_path", coverPublicPath)
      .input("cover_size", coverSize);

    const result = await reqDb.query(`
      INSERT INTO dbo.t_asakai_upload
        (dept, kpi_group, file_name, file_path, file_size, cover_name, cover_path, cover_size)
      VALUES
        (@dept, @kpi_group, @file_name, @file_path, @file_size, @cover_name, @cover_path, @cover_size);

      SELECT SCOPE_IDENTITY() AS id;
    `);

    const newId = result.recordset?.[0]?.id ?? null;

    return NextResponse.json({
      ok: true,
      id: newId,
      fileUrl: mainPublicPath,
      coverUrl: coverPublicPath,
      kpiGroup,
    });
  } catch (err: any) {
    console.error("API /api/asakai-upload error:", err);
    return NextResponse.json(
      {
        ok: false,
        message: err?.message || "Terjadi kesalahan server",
      },
      { status: 500 }
    );
  }
}
