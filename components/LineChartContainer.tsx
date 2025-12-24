// components/LineChartContainer.tsx
"use client";

import React, { useMemo, useState } from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  ChartOptions,
  ChartEvent,
  ActiveElement,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend
);

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const THEME_COLORS: Record<string, string> = {
  INJECTION: "text-amber-500",
  ST: "text-blue-600",
  ASSY: "text-red-600",
};

interface LineChartContainerProps {
  dept: string;
}

type LineRow = {
  line: string;
  target: number;
  actual: number;
  efficiency: number;
};

type ModelDetail = {
  model: string;
  target: number;
  actual: number;

  shift1?: number | null;
  shift2?: number | null;
  shift3?: number | null;

  setupSec?: number | null;
  rjtReasonCd?: string | null;

  itemDesc?: string | null;

  I_SETUP_SEC?: number | null;
  I_RJT_REASON_CD?: string | null;

  // ✅ tambahan dari API: last time masuk per model (MAX I_ST_TIME)
  lastStTime?: string | null;
};

type DowntimeRow = {
  code: string;
  setupSec: number;
};

const RJT_REASON_MASTER: Record<string, string> = {
  "001": "Kajiri",
  "002": "Benda Asing",
  "003": "Gores",
  "004": "Short Mold",
  "005": "Burry",
  "006": "Silver",
  "007": "Weldline",
  "008": "Bubble",
  "009": "Tdk tercat",
  "010": "Bintik",
  "011": "Benang",
  "012": "Cat over",
  "013": "Cat tipis",
  "014": "Oil mark",
  "015": "NG bagian seal",
  "016": "Berubah warna",
  "017": "AL Tipis",
  "018": "Hangus",
  "019": "salah memusukan",
  "020": "Titik Hitam",
  "021": "SerabutdiAlCoat",
  "022": "Warming up",
  "023": "Under Cut",
  "024": "Benda Asing",
  "025": "Tdk tercat",
  "050": "Lain-lain",
  "101": "Meeting",
  "102": "Rest Time",
  "103": "Change Model",
  "104": "Trouble Mekanik",
  "105": "Falure",
  "106": "Setting Produksi",
  "107": "Waiting Part",
  "108": "Try",
  "109": "Maintenance",
  "110": "DLL",
  "111": "6S",
  "199": "Trial",
  "201": "MarkFuncNGDOM",
  "202": "MarkFuncNGImport",
  "203": "MarkVisualNGDOM",
};

function normalizeCode(v: any) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const onlyNum = s.replace(/\D/g, "");
  if (!onlyNum) return s;
  return onlyNum.padStart(3, "0");
}

function reasonLabel(code: any) {
  const c = normalizeCode(code);
  if (!c) return "-";
  return RJT_REASON_MASTER[c] || c;
}

function calcEffPercent(plan: number, actual: number) {
  const p = Number(plan || 0);
  const a = Number(actual || 0);
  const raw = p > 0 ? (a / p) * 100 : a > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, raw));
}

// ✅ persen per shift dibanding plan per model
function calcShiftPercent(plan: number, shiftQty: number) {
  const p = Number(plan || 0);
  const q = Number(shiftQty || 0);
  if (p <= 0) return q > 0 ? 100 : 0;
  const raw = (q / p) * 100;
  return Math.min(100, Math.max(0, raw));
}

// ✅ format I_ST_TIME (contoh 80851 -> 08:08:51)
function formatHHMMSS(v: any) {
  if (v === null || v === undefined) return "-";
  const s0 = String(v).trim();
  if (!s0) return "-";
  const onlyNum = s0.replace(/\D/g, "");
  if (!onlyNum) return s0;
  const s = onlyNum.padStart(6, "0").slice(-6);
  const hh = s.slice(0, 2);
  const mm = s.slice(2, 4);
  const ss = s.slice(4, 6);
  return `${hh}:${mm}:${ss}`;
}

// ✅ Legend custom (tanpa dummy dataset)
function LegendCustom() {
  const COLOR_GOOD = "rgba(34, 197, 94, 0.8)";
  const COLOR_WARN = "rgba(234, 179, 8, 0.8)";
  const COLOR_BAD = "rgba(239, 68, 68, 0.8)";
  const PLAN_RED = "rgba(239, 68, 68, 0.95)";

  return (
    <div className="flex flex-wrap items-center justify-center gap-4 text-[12px] text-slate-600 mb-2">
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-7 rounded-sm" style={{ background: COLOR_GOOD }} />
        <span>Achieve ≥ 80%</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-7 rounded-sm" style={{ background: COLOR_WARN }} />
        <span>Achieve 50–79%</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-7 rounded-sm" style={{ background: COLOR_BAD }} />
        <span>Achieve &lt; 50%</span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-7 rounded-sm"
          style={{
            background: "transparent",
            border: `2px dashed ${PLAN_RED}`,
          }}
        />
        <span>Plan %</span>
      </div>
    </div>
  );
}

// ✅ Legend khusus Plan saja (untuk modal detail line)
function LegendPlanOnly() {
  const PLAN_RED = "rgba(239, 68, 68, 0.95)";
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 text-[12px] text-slate-600 mb-2">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-7 rounded-sm"
          style={{
            background: "transparent",
            border: `2px dashed ${PLAN_RED}`,
          }}
        />
        <span>Plan %</span>
      </div>
    </div>
  );
}

// ✅ Legend custom khusus SHIFT (dipakai cuma di chart model)
function LegendShiftCustom({ dept, hasShift3 }: { dept: string; hasShift3: boolean }) {
  const SHIFT1 = "rgba(34, 197, 94, 0.75)"; // hijau
  const SHIFT2 = "rgba(234, 179, 8, 0.75)"; // kuning
  const SHIFT3 = "rgba(59, 130, 246, 0.75)"; // biru

  const d = String(dept || "").trim().toUpperCase();

  // ✅ ASSY: 2 shift
  const s1LabelAssy = "Shift 1 (08:00–20:00)";
  const s2LabelAssy = "Shift 2 (20:00–08:00)";

  // ✅ ST & INJECTION: 3 shift khusus
  const s3LabelSTINJ = "Shift 3 (00:00–07:10)";
  const s1LabelSTINJ = "Shift 1 (07:10–15:10)";
  const s2LabelSTINJ = "Shift 2 (15:10–00:00)";

  const isSTorInj = d === "ST" || d === "INJECTION";

  const s1Label = isSTorInj ? s1LabelSTINJ : s1LabelAssy;
  const s2Label = isSTorInj ? s2LabelSTINJ : s2LabelAssy;
  const s3Label = isSTorInj ? s3LabelSTINJ : "Shift 3";

  return (
    <div className="flex flex-wrap items-center justify-center gap-4 text-[12px] text-slate-600 mb-2">
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-7 rounded-sm" style={{ background: SHIFT1 }} />
        <span>{s1Label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-7 rounded-sm" style={{ background: SHIFT2 }} />
        <span>{s2Label}</span>
      </div>
      {hasShift3 && (
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-7 rounded-sm" style={{ background: SHIFT3 }} />
          <span>{s3Label}</span>
        </div>
      )}
    </div>
  );
}

export default function LineChartContainer({ dept }: LineChartContainerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const view = useMemo(() => {
    const v = (searchParams.get("view") || "current").toLowerCase();
    return v === "yesterday" ? "yesterday" : "current";
  }, [searchParams]);

  const [isOpen, setIsOpen] = useState(false);
  const [selectedLine, setSelectedLine] = useState<string>("");

  const [modelData, setModelData] = useState<ModelDetail[]>([]);
  const [isLoadingModel, setIsLoadingModel] = useState(false);

  const [downtimeData, setDowntimeData] = useState<DowntimeRow[]>([]);
  const [isLoadingDowntime, setIsLoadingDowntime] = useState(false);

  const linesUrl = useMemo(
    () => `/api/lines?dept=${encodeURIComponent(dept)}&view=${view}`,
    [dept, view]
  );

  const { data: items, isLoading } = useSWR<LineRow[]>(linesUrl, fetcher, {
    refreshInterval: 15000,
  });

  const safeItems = Array.isArray(items) ? items : [];

  const sortedItems = useMemo(() => {
    return [...safeItems].sort((a, b) => {
      const ea = calcEffPercent(Number(a.target || 0), Number(a.actual || 0));
      const eb = calcEffPercent(Number(b.target || 0), Number(b.actual || 0));
      return ea - eb;
    });
  }, [safeItems]);

  const labels = sortedItems.map((i) => i.line);
  const targets = sortedItems.map((i) => i.target);
  const actuals = sortedItems.map((i) => i.actual);

  const effs = sortedItems.map((i) =>
    Number(calcEffPercent(Number(i.target || 0), Number(i.actual || 0)).toFixed(1))
  );

  const handleBarClick = async (event: ChartEvent, elements: ActiveElement[]) => {
    if (elements.length > 0) {
      const index = elements[0].index;
      const clickedLine = labels[index];

      setSelectedLine(clickedLine);
      setIsOpen(true);

      setIsLoadingModel(true);
      setModelData([]);
      setIsLoadingDowntime(true);
      setDowntimeData([]);

      try {
        const [resModels, resDown] = await Promise.all([
          fetch(`/api/models?line=${encodeURIComponent(clickedLine)}&view=${view}`),
          fetch(`/api/downtime?line=${encodeURIComponent(clickedLine)}&view=${view}`),
        ]);

        const dataModels = await resModels.json();
        if (Array.isArray(dataModels)) setModelData(dataModels);

        const dataDown = await resDown.json();
        if (Array.isArray(dataDown)) setDowntimeData(dataDown);
      } catch (error) {
        console.error("Gagal ambil detail", error);
      } finally {
        setIsLoadingModel(false);
        setIsLoadingDowntime(false);
      }
    }
  };

  const COLOR_GOOD = "rgba(34, 197, 94, 0.8)";
  const COLOR_WARN = "rgba(234, 179, 8, 0.8)";
  const COLOR_BAD = "rgba(239, 68, 68, 0.8)";

  const chartData = {
    labels,
    datasets: [
      {
        type: "bar" as const,
        label: "Achieve %",
        data: effs,
        backgroundColor: sortedItems.map((i) => {
          const eff = calcEffPercent(Number(i.target || 0), Number(i.actual || 0));
          if (eff >= 80) return COLOR_GOOD;
          if (eff >= 50) return COLOR_WARN;
          return COLOR_BAD;
        }),
        borderRadius: 4,
        hoverBackgroundColor: "rgba(59, 130, 246, 0.9)",
      },
      {
        type: "line" as const,
        label: "Plan %",
        data: labels.map(() => 100),
        borderColor: "rgba(239, 68, 68, 0.95)",
        backgroundColor: "rgba(239, 68, 68, 0.15)",
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0,
        fill: false,
        clip: 0,
      },
    ],
  };

  const chartOptions: ChartOptions<"bar" | "line"> = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 10 } },
    onClick: handleBarClick,
    onHover: (event, chartElement) => {
      // @ts-ignore
      event.native.target.style.cursor = chartElement.length ? "pointer" : "default";
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const idx = ctx.dataIndex;

            const plan = Number(targets[idx] || 0);
            const achieve = Number(actuals[idx] || 0);

            if (ctx.dataset.label === "Plan (100%)" || ctx.dataset.label === "Plan %") return `Plan: 100%`;

            const efficiency = calcEffPercent(plan, achieve).toFixed(1);

            return [
              `Plan: ${plan.toLocaleString("en-US")}`,
              `Achieve: ${achieve.toLocaleString("en-US")}`,
              `Efficiency: ${efficiency}%`,
            ];
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        ticks: {
          callback: (value) => `${Number(value).toLocaleString("en-US")}%`,
        },
      },
      x: { ticks: { autoSkip: false, maxRotation: 90, minRotation: 90 } },
    },
  };

  const displayModel = (m: ModelDetail) => {
    const desc = String(m.itemDesc ?? "").trim();
    return desc ? `${m.model} (${desc})` : m.model;
  };

  const modelDataSorted = useMemo(() => {
    return [...modelData].sort((a, b) => {
      const ea = calcEffPercent(Number(a.target || 0), Number(a.actual || 0));
      const eb = calcEffPercent(Number(b.target || 0), Number(b.actual || 0));
      return ea - eb;
    });
  }, [modelData]);

  const modelLabels = modelDataSorted.map((m) => displayModel(m));
  const modelEffs = modelDataSorted.map((m) =>
    Number(calcEffPercent(Number(m.target || 0), Number(m.actual || 0)).toFixed(1))
  );

  // ✅ khusus ASSY: tidak ada shift 3
  const hasShift3 = String(dept || "").trim().toUpperCase() !== "ASSY";

  // ✅ BAR SHIFT % (STACKED) untuk grafik model
  const shift1Perc = modelDataSorted.map((m) =>
    Number(calcShiftPercent(Number(m.target || 0), Number(m.shift1 || 0)).toFixed(1))
  );
  const shift2Perc = modelDataSorted.map((m) =>
    Number(calcShiftPercent(Number(m.target || 0), Number(m.shift2 || 0)).toFixed(1))
  );
  const shift3Perc = modelDataSorted.map((m) =>
    Number(calcShiftPercent(Number(m.target || 0), Number(m.shift3 || 0)).toFixed(1))
  );

  const modelChartData = {
    labels: modelLabels,
    datasets: [
      {
        type: "bar" as const,
        label: "Shift 1",
        data: shift1Perc,
        backgroundColor: "rgba(34, 197, 94, 0.75)",
        borderRadius: 4,
        stack: "ach",
      },
      {
        type: "bar" as const,
        label: "Shift 2",
        data: shift2Perc,
        backgroundColor: "rgba(234, 179, 8, 0.75)",
        borderRadius: 4,
        stack: "ach",
      },
      ...(hasShift3
        ? [
            {
              type: "bar" as const,
              label: "Shift 3",
              data: shift3Perc,
              backgroundColor: "rgba(59, 130, 246, 0.75)",
              borderRadius: 4,
              stack: "ach",
            },
          ]
        : []),
      {
        type: "line" as const,
        label: "Plan %",
        data: modelLabels.map(() => 100),
        borderColor: "rgba(239, 68, 68, 0.95)",
        backgroundColor: "rgba(239, 68, 68, 0.15)",
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0,
        fill: false,
        clip: 0,
      },
    ],
  };

  const modelChartOptions: ChartOptions<"bar" | "line"> = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 10 } },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const idx = ctx.dataIndex;

            // ✅ kalau hover/click SHIFT: tampilkan cuma output shift itu saja (seperti "Shift 3: 896")
            const m = modelDataSorted[idx];
            const s1 = Number(m?.shift1 || 0);
            const s2 = Number(m?.shift2 || 0);
            const s3 = Number(m?.shift3 || 0);

            if (ctx.dataset.label === "Shift 1") return `Shift 1: ${s1.toLocaleString("en-US")}`;
            if (ctx.dataset.label === "Shift 2") return `Shift 2: ${s2.toLocaleString("en-US")}`;
            if (ctx.dataset.label === "Shift 3") return `Shift 3: ${s3.toLocaleString("en-US")}`;

            // ✅ detail lengkap dipindah ke saat hover/click "Plan %" (model/kanban info)
            if (ctx.dataset.label === "Plan (100%)" || ctx.dataset.label === "Plan %") {
              const plan = Number(m?.target || 0);
              const achieve = Number(m?.actual || 0);
              const efficiency = calcEffPercent(plan, achieve).toFixed(1);
              const last = formatHHMMSS(m?.lastStTime);

              return [
                `Plan: ${plan.toLocaleString("en-US")}`,
                `Achieve: ${achieve.toLocaleString("en-US")} (${efficiency}%)`,
                `Shift 1: ${s1.toLocaleString("en-US")}`,
                `Shift 2: ${s2.toLocaleString("en-US")}`,
                ...(hasShift3 ? [`Shift 3: ${s3.toLocaleString("en-US")}`] : []),
                `Last Update: ${last}`,
              ];
            }

            return `${ctx.dataset.label}: ${Number(ctx.raw || 0).toFixed(1)}%`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        stacked: true,
        ticks: { callback: (value) => `${Number(value).toLocaleString("en-US")}%` },
      },
      x: {
        stacked: true,
        ticks: { autoSkip: false, maxRotation: 60, minRotation: 30 },
      },
    },
  };

  const totals = useMemo(() => {
    let totalTarget = 0;
    let totalActual = 0;
    for (const m of modelData) {
      totalTarget += Number(m.target || 0);
      totalActual += Number(m.actual || 0);
    }
    return { totalTarget, totalActual };
  }, [modelData]);

  const totalDowntimeSec = useMemo(() => {
    let sum = 0;
    for (const d of downtimeData) sum += Number(d.setupSec || 0);
    return sum;
  }, [downtimeData]);

  const titleColorClass = THEME_COLORS[dept] || "text-gray-700";

  return (
    <div className="min-h-screen bg-slate-50 p-6 relative">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.push(`/?view=${view}`)}
          className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 transition shadow-sm font-medium"
        >
          ← Kembali
        </button>
        <h1 className="text-2xl font-bold text-slate-800">
          Grafik Per Line: <span className={titleColorClass}>{dept}</span>
          <span className="ml-2 text-sm font-semibold text-slate-500">
            ({view === "yesterday" ? "Kemarin" : "Current"})
          </span>
        </h1>
        <div className="w-24" />
      </div>

      {/* CHART CONTAINER */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 md:p-6 h-[60vh] md:h-[70vh]">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-slate-400 animate-pulse">
            Memuat data {dept}...
          </div>
        ) : safeItems.length > 0 ? (
          <div className="h-full w-full relative">
            <LegendCustom />

            <div className="h-full w-full overflow-x-auto pb-2">
              <div
                className="relative h-full"
                style={{
                  minWidth: sortedItems.length > 0 ? `${sortedItems.length * 60}px` : "100%",
                }}
              >
                <Bar data={chartData} options={chartOptions} />
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400">
            Tidak ada data produksi untuk {dept}.
          </div>
        )}
      </div>

      {/* MODAL DETAIL MODEL */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[90vh] flex flex-col">
            {/* HEADER */}
            <div className="bg-slate-100 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">
                Detail Line: <span className="text-blue-600">{selectedLine}</span>
                <span className="ml-2 text-sm font-semibold text-slate-500">
                  ({view === "yesterday" ? "Kemarin" : "Current"})
                </span>
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-2xl font-bold leading-none"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* GRAFIK PER MODEL */}
              <div className="p-4 border-b border-slate-200 h-64 md:h-72">
                {isLoadingModel ? (
                  <div className="h-full flex items-center justify-center text-slate-500 animate-pulse">
                    Sedang mengambil data model...
                  </div>
                ) : modelDataSorted.length > 0 ? (
                  <div className="h-full w-full overflow-x-auto">
                    {/* ✅ khusus detail line: legend Achieve hilang, tinggal Plan + Shift */}
                    <LegendPlanOnly />
                    <LegendShiftCustom dept={dept} hasShift3={hasShift3} />

                    <div
                      className="relative h-full"
                      style={{
                        minWidth: modelDataSorted.length > 0 ? `${modelDataSorted.length * 80}px` : "100%",
                      }}
                    >
                      <Bar data={modelChartData} options={modelChartOptions} />
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400">
                    Tidak ada data model untuk line ini.
                  </div>
                )}
              </div>

              {/* ✅ SUMMARY TOTAL */}
              <div className="px-6 py-3 border-b border-slate-300 bg-slate-50">
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="text-slate-600">
                    Total Plan:{" "}
                    <span className="font-extrabold text-blue-600">
                      {totals.totalTarget.toLocaleString("en-US")}
                    </span>
                  </div>
                  <div className="text-slate-600">
                    Total Achieve:{" "}
                    <span className="font-extrabold text-green-600">
                      {totals.totalActual.toLocaleString("en-US")}
                    </span>
                  </div>
                  <div className="text-slate-600">
                    Total Downtime (sec):{" "}
                    <span className="font-extrabold text-red-600">
                      {totalDowntimeSec.toLocaleString("en-US")}
                    </span>
                  </div>
                </div>
              </div>

              {/* TABEL MODEL */}
              <div className="p-0 border-b border-slate-200">
                {!isLoadingModel && modelData.length > 0 && (
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3">Item</th>
                        <th className="px-6 py-3 text-right">Plan</th>
                        <th className="px-6 py-3 text-right">Achieve</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {modelData.map((m, idx) => {
                        const s1 = Number(m.shift1 || 0);
                        const s2 = Number(m.shift2 || 0);
                        const s3 = Number(m.shift3 || 0);

                        const last = formatHHMMSS(m.lastStTime);

                        return (
                          <tr key={idx} className="hover:bg-slate-50 align-top">
                            <td className="px-6 py-3">
                              <div className="font-medium text-slate-700">{displayModel(m)}</div>

                              <div className="mt-2 text-xs text-slate-600 space-y-1">
                                <div>shift 1 = {s1.toLocaleString("en-US")}</div>
                                <div>shift 2 = {s2.toLocaleString("en-US")}</div>
                                {hasShift3 && <div>shift 3 = {s3.toLocaleString("en-US")}</div>}
                                <div className="pt-1">
                                  Last update: <span className="font-semibold text-slate-700">{last}</span>
                                </div>
                              </div>
                            </td>

                            <td className="px-6 py-3 text-right text-slate-600">
                              {m.target.toLocaleString("en-US")}
                            </td>
                            <td className="px-6 py-3 text-right font-bold text-slate-800">
                              {m.actual.toLocaleString("en-US")}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>

                    <tfoot className="bg-blue-50 border-t-2 border-blue-300">
                      <tr>
                        <td className="px-6 py-3 font-extrabold text-blue-800">TOTAL</td>
                        <td className="px-6 py-3 text-right font-extrabold text-blue-800">
                          {totals.totalTarget.toLocaleString("en-US")}
                        </td>
                        <td className="px-6 py-3 text-right font-extrabold text-green-700">
                          {totals.totalActual.toLocaleString("en-US")}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>

              {/* ✅ DOWNTIME TABLE + TOTAL */}
              <div className="p-0">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3">Downtime</th>
                      <th className="px-6 py-3 text-right">Waktu (sec)</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {isLoadingDowntime ? (
                      <tr>
                        <td className="px-6 py-3 text-slate-500" colSpan={2}>
                          Sedang mengambil data downtime...
                        </td>
                      </tr>
                    ) : downtimeData.length > 0 ? (
                      downtimeData.map((d, idx) => (
                        <tr key={`${d.code}-${idx}`} className="hover:bg-slate-50">
                          <td className="px-6 py-3 text-slate-700">{reasonLabel(d.code)}</td>
                          <td className="px-6 py-3 text-right font-semibold text-slate-800">
                            {Number(d.setupSec || 0).toLocaleString("en-US")}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-6 py-3 text-slate-500" colSpan={2}>
                          Tidak ada data downtime untuk line ini.
                        </td>
                      </tr>
                    )}
                  </tbody>

                  {!isLoadingDowntime && downtimeData.length > 0 && (
                    <tfoot className="bg-red-50 border-t-2 border-red-300">
                      <tr>
                        <td className="px-6 py-3 font-extrabold text-red-700">TOTAL</td>
                        <td className="px-6 py-3 text-right font-extrabold text-red-700">
                          {totalDowntimeSec.toLocaleString("en-US")}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* FOOTER */}
            <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 text-right">
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 font-medium text-sm"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
