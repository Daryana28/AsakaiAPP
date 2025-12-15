// app/api/issues/[id]/chart/route.ts
import { NextResponse } from "next/server";
import { getSqlPool } from "@/lib/mssql";

export const runtime = "nodejs";

type ChartData = {
  title?: string;
  labels: string[];
  series: { name: string; data: number[] }[];
};

async function getId(context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; // ✅ Next 15: params Promise
  const n = Number(id);
  if (!Number.isFinite(n)) throw new Error("Invalid id");
  return n;
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const issueId = await getId(context);

    const pool = await getSqlPool();
    const r = await pool
      .request()
      .input("id", issueId)
      .query(
        `SELECT TOP 1 chart_json FROM dbo.t_asakai_upload WHERE id = @id`
      );

    const raw = r.recordset?.[0]?.chart_json as string | null | undefined;

    // kalau belum ada chart_json → return default kosong
    let chart: ChartData = {
      title: "Grafik",
      labels: [],
      series: [
        { name: "Series 1", data: [] },
        { name: "Series 2", data: [] },
      ],
    };

    if (raw) {
      try {
        chart = JSON.parse(raw);
      } catch {
        // ignore parse error, pakai default
      }
    }

    return NextResponse.json({ chart });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message ?? "Error GET chart" },
      { status: 400 }
    );
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const issueId = await getId(context);
    const body = await req.json();
    const chart = body?.chart as ChartData | undefined;

    if (!chart || !Array.isArray(chart.labels) || !Array.isArray(chart.series)) {
      return NextResponse.json(
        { message: "Invalid chart payload" },
        { status: 400 }
      );
    }

    const pool = await getSqlPool();
    await pool
      .request()
      .input("id", issueId)
      .input("chart_json", JSON.stringify(chart))
      .query(
        `UPDATE dbo.t_asakai_upload SET chart_json = @chart_json WHERE id = @id`
      );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message ?? "Error POST chart" },
      { status: 400 }
    );
  }
}
