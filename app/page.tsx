"use client";

import useSWR from "swr";
import Shell from "@/components/shell";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type DashboardRow = {
  dept: string;
  target_qty: number;
  actual_qty: number;
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

/**
 * Gauge setengah lingkaran (0–100%) dengan arc berwarna + jarum.
 * Persen akan ikut berubah realtime ketika data SWR update.
 */
function HalfGauge({ percent, color }: GaugeProps) {
  const clamp = Math.max(0, Math.min(100, percent));
  const cfg = GAUGE_COLORS[color];

  const radius = 80;
  const circumference = Math.PI * radius; // keliling setengah lingkaran
  const offset = circumference - (clamp / 100) * circumference;

  // jarum: -90 = kiri, +90 = kanan
  const rotation = (clamp / 100) * 180 - 90;

  return (
    <div className="relative flex flex-col items-center pt-1">
      <svg
        className="w-64 h-40 md:w-80 md:h-48"
        viewBox="0 0 200 120"
        aria-hidden="true"
      >
        {/* background arc abu-abu lembut */}
        <path
          d="M 20,100 A 80,80 0 0,1 180,100"
          fill="none"
          stroke="#E5ECE8"
          strokeWidth="16"
          strokeLinecap="round"
        />
        {/* arc progress berwarna */}
        <path
          d="M 20,100 A 80,80 0 0,1 180,100"
          fill="none"
          stroke={cfg.ring}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 0.7s ease-out",
          }}
        />
        {/* titik pusat jarum */}
        <circle cx="100" cy="100" r="5" fill="#111827" />
        {/* jarum utama */}
        <line
          x1="100"
          y1="100"
          x2="100"
          y2="30"
          stroke="#111827"
          strokeWidth="3.4"
          strokeLinecap="round"
          style={{
            transformOrigin: "100px 100px",
            transform: `rotate(${rotation}deg)`,
            transition: "transform 0.7s ease-out",
          }}
        />
        {/* ujung jarum kecil */}
        <circle cx="100" cy="30" r="3" fill="#111827" style={{
          transformOrigin: "100px 100px",
          transform: `rotate(${rotation}deg)`,
          transition: "transform 0.7s ease-out",
        }} />
      </svg>

      <div
        className={`-mt-4 text-3xl md:text-4xl font-extrabold tracking-tight ${cfg.text}`}
      >
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
}: {
  dept: string;
  target: number;
  actual: number;
  color: GaugeColor;
}) {
  const percent = target ? Math.round((actual / target) * 100) : 0;
  const gap = target - actual;

  return (
    <div className="bg-white/95 border border-slate-200 rounded-3xl px-6 py-5 flex flex-col gap-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      {/* header dept */}
      <div className="flex items-center justify-between">
        {/* <h2 className="text-lg md:text-xl font-semibold tracking-tight">
          {dept}
        </h2>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
          Realtime
        </span> */}
      </div>

      {/* gauge */}
      <HalfGauge percent={percent} color={color} />

      {/* garis pemisah */}
      <div className="w-full border-t border-gray-200" />

      {/* detail angka */}
      <div className="grid grid-cols-1 gap-1.5 text-xs md:text-sm text-gray-700 text-center">
        <div>
          <div className="font-semibold">Production Target (Pcs)</div>
          <div className="font-medium tracking-tight">
            {formatNumber(target)}
          </div>
        </div>
        <div>
          <div className="font-semibold">Production Result (Pcs)</div>
          <div className="font-medium tracking-tight">
            {formatNumber(actual)}
          </div>
        </div>
        <div>
          <div className="font-semibold">GAP (Pcs)</div>
          <div className="font-medium tracking-tight">{formatNumber(gap)}</div>
        </div>
        <div>
          <div className="font-semibold">Line Stop (HH:mm)</div>
          <div className="font-medium tracking-tight">0:00</div>
        </div>
      </div>

      {/* bar Safety / BNF / RIL / Delivery */}
      <div className="mt-3 w-full space-y-1 text-xs md:text-sm text-white">
        <div className="flex gap-1">
          <div className="bg-red-500 rounded-l-lg px-3 py-1.5 font-semibold flex-[4]">
            Safety
          </div>
          <div className="bg-emerald-500 rounded-r-lg px-3 py-1.5 text-center flex-[1]">
            0
          </div>
        </div>

        <div className="flex gap-1">
          <div className="bg-amber-400 rounded-l-lg px-3 py-1.5 font-semibold flex-[4]">
            BNF
          </div>
          <div className="bg-emerald-500 rounded-r-lg px-3 py-1.5 text-center flex-[1]">
            0
          </div>
        </div>

        <div className="flex gap-1">
          <div className="bg-blue-600 rounded-l-lg px-3 py-1.5 font-semibold flex-[4]">
            RIL
          </div>
          <div className="bg-emerald-500 rounded-r-lg px-3 py-1.5 text-center flex-[1]">
            0
          </div>
        </div>

        <div className="flex gap-1">
          <div className="bg-violet-500 rounded-l-lg px-3 py-1.5 font-semibold flex-[4]">
            Delivery
          </div>
          <div className="bg-emerald-500 rounded-r-lg px-3 py-1.5 text-center flex-[1]">
            0
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const { data, isLoading } = useSWR<DashboardRow[]>(
    "/api/dashboard",
    fetcher,
    { refreshInterval: 10000 } // nanti begitu API + DB siap, ini sudah realtime
  );

  const colorByDept: Record<string, GaugeColor> = {
    Injection: "yellow",
    "Surface Treatment": "blue",
    Assembly: "red",
  };

  const orderedDepts = ["Injection", "Surface Treatment", "Assembly"];

  const rows = orderedDepts
    .map((dept) => data?.find((r) => r.dept === dept))
    .filter(Boolean) as DashboardRow[];

  return (
    <Shell>
      {isLoading && (
        <div className="mt-10 text-center text-gray-500 text-sm">
          Loading data...
        </div>
      )}

      {!isLoading && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-5">
          {rows.map((row) => (
            <DeptCard
              key={row.dept}
              dept={row.dept}
              target={row.target_qty}
              actual={row.actual_qty}
              color={colorByDept[row.dept] ?? "yellow"}
            />
          ))}
        </div>
      )}
    </Shell>
  );
}
