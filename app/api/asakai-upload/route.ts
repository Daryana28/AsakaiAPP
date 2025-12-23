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

    // Validasi basic
    if (!dept || typeof dept !== "string") {
      return NextResponse.json(
        { ok: false, message: "dept wajib diisi" },
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

    const result = await pool
      .request()
      .input("dept", dept)
      .input("file_name", file.name)
      .input("file_path", mainPublicPath)
      .input("file_size", file.size)
      .input("cover_name", coverName)
      .input("cover_path", coverPublicPath)
      .input("cover_size", coverSize)
      .query(`
        INSERT INTO dbo.t_asakai_upload
          (dept, file_name, file_path, file_size, cover_name, cover_path, cover_size)
        VALUES
          (@dept, @file_name, @file_path, @file_size, @cover_name, @cover_path, @cover_size);

        SELECT SCOPE_IDENTITY() AS id;
      `);

    const newId = result.recordset?.[0]?.id ?? null;

    return NextResponse.json({
      ok: true,
      id: newId,
      fileUrl: mainPublicPath,
      coverUrl: coverPublicPath,
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
