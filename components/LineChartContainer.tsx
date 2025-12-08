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

// Registrasi ChartJS
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

// Tipe data untuk Detail Model
type ModelDetail = {
  model: string;
  target: number;
  actual: number;
};

export default function LineChartContainer({ dept }: LineChartContainerProps) {
  const router = useRouter();
  
  // State untuk Pop-up (Modal)
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLine, setSelectedLine] = useState<string>("");
  const [modelData, setModelData] = useState<ModelDetail[]>([]);
  const [isLoadingModel, setIsLoadingModel] = useState(false);

  // Fetch Data Utama (Grafik Line)
  const { data: items, isLoading } = useSWR(
    `/api/lines?dept=${dept}`, 
    fetcher,
    { refreshInterval: 5000 }
  );

  const labels = Array.isArray(items) ? items.map((i: any) => i.line) : [];
  const actuals = Array.isArray(items) ? items.map((i: any) => i.actual) : [];
  const targets = Array.isArray(items) ? items.map((i: any) => i.target) : [];

  // --- FUNGSI KLIK GRAFIK ---
  const handleBarClick = async (event: ChartEvent, elements: ActiveElement[]) => {
    if (elements.length > 0) {
      const index = elements[0].index;
      const clickedLine = labels[index]; // Dapat nama line, misal "INJ-01"

      // 1. Buka Modal & Set Loading
      setSelectedLine(clickedLine);
      setIsOpen(true);
      setIsLoadingModel(true);
      setModelData([]); // Reset data lama

      // 2. Panggil API Detail Model
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

  const chartData = {
    labels,
    datasets: [
      {
        label: "Actual Qty",
        data: actuals,
        // Warna tetap mengikuti logika efisiensi
        backgroundColor: Array.isArray(items) ? items.map((i: any) => {
          const eff = i.target > 0 ? (i.actual / i.target) * 100 : 0;
          if (eff >= 90) return "rgba(34, 197, 94, 0.8)"; 
          if (eff >= 70) return "rgba(234, 179, 8, 0.8)"; 
          return "rgba(239, 68, 68, 0.8)"; 
        }) : [],
        borderRadius: 4,
        // Ubah warna saat mouse hover agar user tahu bisa diklik
        hoverBackgroundColor: "rgba(59, 130, 246, 0.9)",
      },
    ],
  };

  const chartOptions: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    // Aktifkan event onClick
    onClick: handleBarClick,
    onHover: (event, chartElement) => {
      // Ubah kursor jadi pointer (tangan) saat kena batang
      // @ts-ignore
      event.native.target.style.cursor = chartElement.length ? 'pointer' : 'default';
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
             const idx = ctx.dataIndex;
             const target = targets[idx] || 0;
             return ` Actual: ${ctx.parsed.y} (Target: ${target}) - Klik untuk Detail`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { callback: (v) => v.toLocaleString("en-US") },
      },
      x: {
        ticks: { autoSkip: false, maxRotation: 90, minRotation: 90 },
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
        <div className="w-24"></div>
      </div>

      {/* CHART CONTAINER */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 h-[70vh]">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-slate-400 animate-pulse">
            Memuat data {dept}...
          </div>
        ) : Array.isArray(items) && items.length > 0 ? (
          <div className="h-full w-full relative">
            <div className="h-full overflow-x-auto pb-2">
              <div style={{ width: `${Math.max(items.length * 50, 1000)}px`, height: "100%" }}>
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

      {/* --- MODAL / POPUP DETAIL MODEL --- */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            
            {/* Modal Header */}
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

            {/* Modal Body (Table) */}
            <div className="p-0 max-h-[60vh] overflow-y-auto">
              {isLoadingModel ? (
                <div className="p-8 text-center text-slate-500 animate-pulse">
                  Sedang mengambil data model...
                </div>
              ) : modelData.length > 0 ? (
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3">Nama Model</th>
                      <th className="px-6 py-3 text-right">Target</th>
                      <th className="px-6 py-3 text-right">Actual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {modelData.map((m, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-6 py-3 font-medium text-slate-700">{m.model}</td>
                        <td className="px-6 py-3 text-right text-slate-600">{m.target.toLocaleString()}</td>
                        <td className="px-6 py-3 text-right font-bold text-slate-800">{m.actual.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center text-slate-400">
                  Tidak ada data model untuk line ini.
                </div>
              )}
            </div>

            {/* Modal Footer */}
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