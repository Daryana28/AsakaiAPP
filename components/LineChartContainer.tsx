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
  Tooltip,
  Legend,
  ChartOptions,
  ChartEvent,
  ActiveElement,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

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
  setupSec?: number | null;
  rjtReasonCd?: string | null;
  I_SETUP_SEC?: number | null;
  I_RJT_REASON_CD?: string | null;
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
  "110": "Dll",
  "111": "6S",
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

  const labels = safeItems.map((i) => i.line);
  const targets = safeItems.map((i) => i.target);
  const actuals = safeItems.map((i) => i.actual);

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

  const chartData = {
    labels,
    datasets: [
      {
        label: "Actual Qty",
        data: actuals,
        backgroundColor: safeItems.map((i) => {
          const eff = i.efficiency ?? (i.target > 0 ? (i.actual / i.target) * 100 : 0);
          if (eff >= 80) return "rgba(34, 197, 94, 0.8)";
          if (eff >= 50) return "rgba(234, 179, 8, 0.8)";
          return "rgba(239, 68, 68, 0.8)";
        }),
        borderRadius: 4,
        hoverBackgroundColor: "rgba(59, 130, 246, 0.9)",
      },
    ],
  };

  const chartOptions: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
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
            const target = targets[idx] || 0;
            const actual = actuals[idx] || 0;
            const eff = target > 0 ? ((actual / target) * 100).toFixed(1) : "0.0";
            return (
              ` Actual: ${actual.toLocaleString("en-US")} ` +
              `(Target: ${target.toLocaleString("en-US")}, ` +
              `Eff: ${eff}%) – Klik untuk detail`
            );
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { callback: (value) => Number(value).toLocaleString("en-US") },
      },
      x: { ticks: { autoSkip: false, maxRotation: 90, minRotation: 90 } },
    },
  };

  const modelLabels = modelData.map((m) => m.model);
  const modelTargets = modelData.map((m) => m.target);
  const modelActuals = modelData.map((m) => m.actual);

  const modelChartData = {
    labels: modelLabels,
    datasets: [
      {
        label: "Target",
        data: modelTargets,
        backgroundColor: "rgba(59, 130, 246, 0.5)",
        borderRadius: 4,
      },
      {
        label: "Actual",
        data: modelActuals,
        backgroundColor: "rgba(34, 197, 94, 0.7)",
        borderRadius: 4,
      },
    ],
  };

  const modelChartOptions: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: "top" },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${Number(ctx.raw).toLocaleString("en-US")}`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { callback: (value) => Number(value).toLocaleString("en-US") },
      },
      x: { ticks: { autoSkip: false, maxRotation: 60, minRotation: 30 } },
    },
  };

  // ✅ TOTAL PLAN/ACTUAL dari tabel model
  const totals = useMemo(() => {
    let totalTarget = 0;
    let totalActual = 0;
    for (const m of modelData) {
      totalTarget += Number(m.target || 0);
      totalActual += Number(m.actual || 0);
    }
    return { totalTarget, totalActual };
  }, [modelData]);

  // ✅ TOTAL DOWNTIME (SUM semua jenis downtime)
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
            <div className="h-full w-full overflow-x-auto pb-2">
              <div
                className="relative h-full"
                style={{
                  minWidth: safeItems.length > 0 ? `${safeItems.length * 60}px` : "100%",
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

            {/* 1 area scroll */}
            <div className="flex-1 overflow-y-auto">
              {/* GRAFIK PER MODEL */}
              <div className="p-4 border-b border-slate-200 h-64 md:h-72">
                {isLoadingModel ? (
                  <div className="h-full flex items-center justify-center text-slate-500 animate-pulse">
                    Sedang mengambil data model...
                  </div>
                ) : modelData.length > 0 ? (
                  <div className="h-full w-full overflow-x-auto">
                    <div
                      className="relative h-full"
                      style={{
                        minWidth: modelData.length > 0 ? `${modelData.length * 80}px` : "100%",
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

              {/* ✅ SUMMARY TOTAL (warna dibedakan) */}
              <div className="px-6 py-3 border-b border-slate-300 bg-slate-50">
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="text-slate-600">
                    Total Target (Plan):{" "}
                    <span className="font-extrabold text-blue-600">
                      {totals.totalTarget.toLocaleString("en-US")}
                    </span>
                  </div>
                  <div className="text-slate-600">
                    Total Actual:{" "}
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
                        <th className="px-6 py-3">Kanban</th>
                        <th className="px-6 py-3 text-right">Target</th>
                        <th className="px-6 py-3 text-right">Actual</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {modelData.map((m, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-6 py-3 font-medium text-slate-700">{m.model}</td>
                          <td className="px-6 py-3 text-right text-slate-600">
                            {m.target.toLocaleString("en-US")}
                          </td>
                          <td className="px-6 py-3 text-right font-bold text-slate-800">
                            {m.actual.toLocaleString("en-US")}
                          </td>
                        </tr>
                      ))}
                    </tbody>

                    {/* ✅ TOTAL row (lebih kontras) */}
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

              {/* ✅ DOWNTIME TABLE + TOTAL (lebih kontras) */}
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
                          Tidak ada data downtime (I_RJT_REASON_CD) untuk line ini.
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
