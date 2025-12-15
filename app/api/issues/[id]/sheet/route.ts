// app/api/issues/[id]/sheet/route.ts
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

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const issueId = await getId(context);
    const url = new URL(req.url);
    const sheet = url.searchParams.get("sheet"); // optional

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

    const buf = await fsp.readFile(abs);
    const wb = XLSX.read(buf, { type: "buffer" });

    const sheetNames = wb.SheetNames || [];
    if (sheetNames.length === 0) {
      return NextResponse.json({ sheetNames: [], activeSheet: null, aoa: [] });
    }

    // pilih sheet: query ?sheet=..., kalau kosong ambil sheet pertama yang ada data
    let activeSheet =
      (sheet && sheetNames.includes(sheet) ? sheet : null) ??
      (sheetNames.find((n) => {
        const ws = wb.Sheets[n];
        const tmp = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
        return tmp.length > 0 && tmp.some((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
      }) ?? sheetNames[0]);

    const ws = wb.Sheets[activeSheet];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];

    return NextResponse.json({ sheetNames, activeSheet, aoa });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message ?? "Error GET sheet" },
      { status: 400 }
    );
  }
}
