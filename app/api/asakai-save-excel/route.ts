// app/api/asakai-save-excel/route.ts
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const file = form.get("file") as File | null;
    const relPath = form.get("path") as string | null;

    if (!file || !relPath) {
      return NextResponse.json(
        { ok: false, error: "file / path tidak lengkap" },
        { status: 400 }
      );
    }

    // relPath contoh: /uploads/asakai/abc.xlsx
    const cleaned = relPath.replace(/^\/+/, ""); // hilangkan leading slash
    const absPath = path.join(process.cwd(), "public", cleaned);
    // kalau folder uploads kamu bukan di /public, sesuaikan di sini

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // pastikan foldernya ada
    const dir = path.dirname(absPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(absPath, buffer);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("asakai-save-excel error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Gagal simpan file" },
      { status: 500 }
    );
  }
}
