"use client";

import React from "react";
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
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AssyPage() {
  const router = useRouter();
  
  // Panggil API dengan parameter dept=ASSY
  const { data: items, isLoading } = useSWR(
    "/api/lines?dept=ASSY",
    fetcher,
    { refreshInterval: 5000 }
  );

  const labels = items ? items.map((i: any) => i.line) : [];
  const efficiencies = items ? items.map((i: any) => i.efficiency) : [];

  const chartData = {
    labels,
    datasets: [
      {
        label: "Efficiency (%)",
        data: efficiencies,
        backgroundColor: efficiencies.map((val: number) => {
          if (val >= 90) return "rgba(34, 197, 94, 0.8)";
          if (val >= 70) return "rgba(234, 179, 8, 0.8)";
          return "rgba(239, 68, 68, 0.8)";
        }),
        borderRadius: 4,
      },
    ],
  };

  const chartOptions: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, max: 120 },
      x: { ticks: { autoSkip: false, maxRotation: 90, minRotation: 90 } }
    },
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.back()}
          className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 transition shadow-sm font-medium"
        >
          ← Kembali
        </button>
        <h1 className="text-2xl font-bold text-slate-800">
          Grafik Per Line: <span className="text-red-500">ASSEMBLY</span>
        </h1>
        <div className="w-24"></div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 h-[70vh]">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-slate-400 animate-pulse">Memuat...</div>
        ) : items && items.length > 0 ? (
          <div className="h-full overflow-x-auto pb-2">
            <div style={{ width: `${Math.max(items.length * 60, 1000)}px`, height: "100%" }}>
              <Bar data={chartData} options={chartOptions} />
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400">Tidak ada data.</div>
        )}
      </div>
    </div>
  );
}