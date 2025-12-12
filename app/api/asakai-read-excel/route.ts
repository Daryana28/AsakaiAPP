import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const { filePath } = await req.json();

    if (!filePath) {
      return NextResponse.json({ ok: false, error: "filePath required" });
    }

    const absPath = path.join(process.cwd(), "public", filePath.replace("/uploads", "uploads"));

    if (!fs.existsSync(absPath)) {
      return NextResponse.json({ ok: false, error: "File tidak ditemukan" });
    }

    const buffer = fs.readFileSync(absPath);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream"
      }
    });

  } catch (err: any) {
    console.error("API read excel error:", err);
    return NextResponse.json({ ok: false, error: err.message });
  }
}
