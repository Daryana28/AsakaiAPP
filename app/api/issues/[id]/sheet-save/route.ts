// app/api/issues/[id]/sheet-save/route.ts
import { NextResponse } from "next/server";
import { getSqlPool } from "@/lib/mssql";
import * as XLSX from "xlsx";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";

export const runtime = "nodejs";

async function getId(context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const n = Number(id);
  if (!Number.isFinite(n)) throw new Error("Invalid id");
  return n;
}

function toAbsFromPublic(filePath: string) {
  const clean = filePath.startsWith("/") ? filePath.slice(1) : filePath;
  return path.join(process.cwd(), "public", clean);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const issueId = await getId(context);
    const body = await req.json();

    const sheetName = String(body?.sheetName ?? "");
    const aoa = body?.aoa as any[][];

    if (!sheetName || !Array.isArray(aoa)) {
      return NextResponse.json(
        { message: "Payload harus { sheetName, aoa }" },
        { status: 400 }
      );
    }

    const pool = await getSqlPool();
    const r = await pool
      .request()
      .input("id", issueId)
      .query(`SELECT TOP 1 file_path FROM dbo.t_asakai_upload WHERE id=@id`);

    const file_path = r.recordset?.[0]?.file_path as string | undefined;
    if (!file_path) {
      return NextResponse.json({ message: "file_path not found" }, { status: 404 });
    }

    const abs = toAbsFromPublic(file_path);
    if (!fs.existsSync(abs)) {
      return NextResponse.json(
        { message: "File not exists on server", file_path, abs },
        { status: 404 }
      );
    }

    // load workbook existing
    const buf = await fsp.readFile(abs);
    const wb = XLSX.read(buf, { type: "buffer" });

    // replace sheet
    const newWs = XLSX.utils.aoa_to_sheet(aoa);

    // kalau sheet belum ada, tambahkan
    wb.Sheets[sheetName] = newWs;
    if (!wb.SheetNames.includes(sheetName)) wb.SheetNames.push(sheetName);

    const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    await fsp.writeFile(abs, out);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message ?? "Error save sheet" },
      { status: 400 }
    );
  }
}
