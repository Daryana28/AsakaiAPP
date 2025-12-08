"use client";

import useSWR from "swr";
// Import Link dari Next.js untuk navigasi
import Link from "next/link"; 
import Shell from "@/components/shell"; 

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type DashboardRow = {
  dept: string;       
  qty_seihan: number; 
  qty_aktual: number; 
};

type GaugeColor = "yellow" | "blue" | "red";

type GaugeProps = {
  percent: number;
  color: GaugeColor;
};

const GAUGE_COLORS: Record<
  GaugeColor,
  { ring: string; text: string; glow: string }
> = {
  yellow: {
    ring: "#f4b41a",
    text: "text-amber-500",
    glow: "shadow-[0_0_24px_rgba(244,180,26,0.25)]",
  },
  blue: {
    ring: "#2563eb",
    text: "text-blue-600",
    glow: "shadow-[0_0_24px_rgba(37,99,235,0.25)]",
  },
  red: {
    ring: "#dc2626",
    text: "text-red-500",
    glow: "shadow-[0_0_24px_rgba(220,38,38,0.25)]",
  },
};

function formatNumber(n: number | null | undefined) {
  if (n == null) return "-";
  return n.toLocaleString("en-US");
}

function HalfGauge({ percent, color }: GaugeProps) {
  const clamp = Math.max(0, Math.min(100, percent));
  const cfg = GAUGE_COLORS[color];

  const radius = 80;
  const circumference = Math.PI * radius;
  const offset = circumference - (clamp / 100) * circumference;
  const rotation = (clamp / 100) * 180 - 90;

  return (
    // Tambahkan w-full agar container bisa mengikuti lebar parent
    <div className="relative flex flex-col items-center pt-1 w-full">
      <svg
        // UBAH DISINI:
        // Dari fixed width (w-64/w-80) menjadi responsive (w-full h-auto).
        // max-w-[22rem] (sekitar 350px) menjaga agar tidak terlalu besar di layar lebar.
        className="w-full h-auto max-w-[18rem] md:max-w-[22rem]"
        viewBox="0 0 200 120"
        aria-hidden="true"
      >
        <path
          d="M 20,100 A 80,80 0 0,1 180,100"
          fill="none"
          stroke="#E5ECE8"
          strokeWidth="16"
          strokeLinecap="round"
        />
        <path
          d="M 20,100 A 80,80 0 0,1 180,100"
          fill="none"
          stroke={cfg.ring}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.7s ease-out" }}
        />
        <circle cx="100" cy="100" r="5" fill="#111827" />
        <line
          x1="100" y1="100" x2="100" y2="30"
          stroke="#111827"
          strokeWidth="3.4"
          strokeLinecap="round"
          style={{
            transformOrigin: "100px 100px",
            transform: `rotate(${rotation}deg)`,
            transition: "transform 0.7s ease-out",
          }}
        />
        <circle
          cx="100" cy="30" r="3" fill="#111827"
          style={{
            transformOrigin: "100px 100px",
            transform: `rotate(${rotation}deg)`,
            transition: "transform 0.7s ease-out",
          }}
        />
      </svg>
      
      {/* Margin top minus agar angka naik sedikit ke dalam gauge */}
      <div className={`-mt-6 text-3xl md:text-4xl font-extrabold tracking-tight ${cfg.text}`}>
        {clamp}%
      </div>
    </div>
  );
}

function DeptCard({
  dept,
  target,
  actual,
  color,
  href,
}: {
  dept: string;
  target: number;
  actual: number;
  color: GaugeColor;
  href: string;
}) {
  const percent = target ? Math.round((actual / target) * 100) : 0;
  const gap = target - actual;

  return (
    <Link href={href} className="block group cursor-pointer h-full">
      <div className="bg-white/95 border border-slate-200 rounded-3xl px-6 py-5 flex flex-col gap-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)] h-full transition-transform duration-300 ease-in-out group-hover:scale-[1.02] group-hover:shadow-lg">
        
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-800 group-hover:text-blue-600 transition-colors">
            {dept} &rarr;
          </h3>
        </div>

        {/* Container untuk Gauge agar terpusat */}
        <div className="flex justify-center w-full">
            <HalfGauge percent={percent} color={color} />
        </div>

        <div className="w-full border-t border-gray-200" />

        <div className="grid grid-cols-1 gap-1.5 text-xs md:text-sm text-gray-700 text-center">
          <div>
            <div className="font-semibold">Production Target (Pcs)</div>
            <div className="font-medium tracking-tight">{formatNumber(target)}</div>
          </div>
          <div>
            <div className="font-semibold">Production Result (Pcs)</div>
            <div className="font-medium tracking-tight">{formatNumber(actual)}</div>
          </div>
          <div>
            <div className="font-semibold">GAP (Pcs)</div>
            <div className={`font-medium tracking-tight ${gap > 0 ? 'text-red-500' : 'text-green-600'}`}>
              {formatNumber(gap)}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function Page() {
  const { data, isLoading, error } = useSWR<DashboardRow[]>(
    "/api/dashboard",
    fetcher,
    { refreshInterval: 5000 }
  );

  const colorByDept: Record<string, GaugeColor> = {
    "INJECTION": "yellow",
    "ST": "blue",       
    "ASSY": "red",      
  };

  const routesByDept: Record<string, string> = {
    "INJECTION": "/injection",
    "ST": "/st",    
    "ASSY": "/assy", 
  };

  const orderedDepts = ["INJECTION", "ST", "ASSY"];
  const safeData = Array.isArray(data) ? data : [];

  const rows = orderedDepts.map((deptName) => {
    const foundData = safeData.find((r) => r.dept === deptName);
    if (foundData) return foundData;
    return { dept: deptName, qty_seihan: 0, qty_aktual: 0 };
  });

  return (
    <Shell> 
      {error && <div className="p-4 text-red-500 bg-red-50 rounded mb-4">Gagal mengambil data database</div>}

      {isLoading && (
        <div className="mt-10 text-center text-gray-500 text-sm animate-pulse">
          Sedang memuat data produksi...
        </div>
      )}

      {!isLoading && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-5">
          {rows.map((row) => (
            <DeptCard
              key={row.dept}
              dept={row.dept}
              target={row.qty_seihan}
              actual={row.qty_aktual}
              color={colorByDept[row.dept] ?? "yellow"}
              href={routesByDept[row.dept] ?? "/injection"}
            />
          ))}
        </div>
      )}
    </Shell>
  );
}