"use client";

import React, { useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
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

// Data dari /api/lines
type LineRow = {
  line: string;
  target: number;      // full qty (100%)
  actual: number;      // 80% dari target (hasil pengurangan 20%)
  efficiency: number;  // actual / target * 100
};

// Tipe data untuk Detail Model
type ModelDetail = {
  model: string;
  target: number;
  actual: number;
};

export default function LineChartContainer({ dept }: LineChartContainerProps) {
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [selectedLine, setSelectedLine] = useState<string>("");
  const [modelData, setModelData] = useState<ModelDetail[]>([]);
  const [isLoadingModel, setIsLoadingModel] = useState(false);

  // === FETCH DATA LINE ===
  const { data: items, isLoading } = useSWR<LineRow[]>(
    `/api/lines?dept=${dept}`,
    fetcher,
    { refreshInterval: 5000 }
  );

  const safeItems = Array.isArray(items) ? items : [];

  const labels = safeItems.map((i) => i.line);
  const targets = safeItems.map((i) => i.target);
  const actuals = safeItems.map((i) => i.actual);

  // --- KLIK BAR UNTUK DETAIL MODEL ---
  const handleBarClick = async (event: ChartEvent, elements: ActiveElement[]) => {
    if (elements.length > 0) {
      const index = elements[0].index;
      const clickedLine = labels[index];

      setSelectedLine(clickedLine);
      setIsOpen(true);
      setIsLoadingModel(true);
      setModelData([]);

      try {
        const res = await fetch(`/api/models?line=${clickedLine}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setModelData(data);
        }
      } catch (error) {
        console.error("Gagal ambil detail model", error);
      } finally {
        setIsLoadingModel(false);
      }
    }
  };

  // === DATA UNTUK CHART PER LINE ===
  const chartData = {
    labels,
    datasets: [
      {
        label: "Actual Qty",
        data: actuals,
        backgroundColor: safeItems.map((i) => {
          const eff =
            i.efficiency ?? (i.target > 0 ? (i.actual / i.target) * 100 : 0);

          // < 50%   -> merah
          // 50–79%  -> kuning
          // >= 80%  -> hijau
          if (eff >= 80) return "rgba(34, 197, 94, 0.8)";   // hijau
          if (eff >= 50) return "rgba(234, 179, 8, 0.8)";   // kuning
          return "rgba(239, 68, 68, 0.8)";                  // merah
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
            const eff =
              target > 0 ? ((actual / target) * 100).toFixed(1) : "0.0";

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
        ticks: {
          callback: (value) => Number(value).toLocaleString("en-US"),
        },
      },
      x: {
        ticks: { autoSkip: false, maxRotation: 90, minRotation: 90 },
      },
    },
  };

  // === DATA UNTUK CHART DI MODAL (PER MODEL) ===
  const modelLabels = modelData.map((m) => m.model);
  const modelTargets = modelData.map((m) => m.target);
  const modelActuals = modelData.map((m) => m.actual);

  const modelChartData = {
    labels: modelLabels,
    datasets: [
      {
        label: "Target",
        data: modelTargets,
        backgroundColor: "rgba(59, 130, 246, 0.5)", // biru transparan
        borderRadius: 4,
      },
      {
        label: "Actual",
        data: modelActuals,
        backgroundColor: "rgba(34, 197, 94, 0.7)", // hijau
        borderRadius: 4,
      },
    ],
  };

  const modelChartOptions: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: "top",
      },
      tooltip: {
        callbacks: {
          label: (ctx) =>
            `${ctx.dataset.label}: ${Number(ctx.raw).toLocaleString("en-US")}`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value) => Number(value).toLocaleString("en-US"),
        },
      },
      x: {
        ticks: { autoSkip: false, maxRotation: 60, minRotation: 30 },
      },
    },
  };

  const titleColorClass = THEME_COLORS[dept] || "text-gray-700";

  return (
    <div className="min-h-screen bg-slate-50 p-6 relative">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.back()}
          className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 transition shadow-sm font-medium"
        >
          ← Kembali
        </button>
        <h1 className="text-2xl font-bold text-slate-800">
          Grafik Per Line: <span className={titleColorClass}>{dept}</span>
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
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-slate-100 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">
                Detail Line: <span className="text-blue-600">{selectedLine}</span>
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-2xl font-bold leading-none"
              >
                &times;
              </button>
            </div>

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
                      minWidth:
                        modelData.length > 0
                          ? `${modelData.length * 80}px`
                          : "100%",
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

            {/* TABEL DETAIL MODEL */}
            <div className="p-0 max-h-[50vh] overflow-y-auto">
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
                        <td className="px-6 py-3 font-medium text-slate-700">
                          {m.model}
                        </td>
                        <td className="px-6 py-3 text-right text-slate-600">
                          {m.target.toLocaleString()}
                        </td>
                        <td className="px-6 py-3 text-right font-bold text-slate-800">
                          {m.actual.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

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
