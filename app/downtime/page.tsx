// app/downtime/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Shell from "@/components/shell";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const GREEN = {
  base: "#0E7B4A",
  soft: "#E9F4EE",
  ring: "#B9D7C8",
  sage: "#6C8B7B",
  text: "#0F172A",
  border: "#E5ECE8",
  card: "#FFFFFF",
  dim: "#6B7280",
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

type ViewMode = "current" | "yesterday";

type ApiRow = {
  code: string;
  setupSec: number; // seconds
  ymd: string;
  view: ViewMode;
  line: string;
  mode?: string;
};

const CHARTS: Array<{ title: string; line: string }> = [
  { title: "TOTAL DOWNTIME ALL DEPARTEMENT", line: "DETAIL" },
  { title: "DOWNTIME ASSY", line: "ASSY" },
  { title: "TOTAL DOWNTIME ST", line: "ST" },
  { title: "TOTAL DOWNTIME INJECTION", line: "INJECTION" },
];

const COLORS = ["#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899", "#14B8A6", "#64748B", "#EF4444"];

function fmtYmd(ymd: string) {
  if (!ymd || ymd.length !== 8) return ymd;
  return `${ymd.slice(6, 8)}-${ymd.slice(4, 6)}-${ymd.slice(0, 4)}`;
}

/** detik -> "xh ym" */
function fmtDurFromSec(sec: number) {
  const s = Math.max(0, Math.floor(Number(sec || 0)));
  const totalMin = Math.round(s / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;

  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-4 sm:p-6" style={{ borderColor: GREEN.border, background: GREEN.card }}>
      <div className="text-center">
        <div className="text-[11px] tracking-[0.18em] font-semibold text-[#7A8F87]">{title}</div>
        {subtitle && <div className="mt-1 text-[11px] text-[#94A3B8]">{subtitle}</div>}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** ✅ only valid reason; else null (dibuuuang) */
function codeToLabel(code: string): string | null {
  const k = String(code || "").trim();
  if (!k) return null;
  return RJT_REASON_MASTER[k] ?? null;
}

/** ✅ group + sum by label; buang yang tidak ada master; no Other */
function buildSeries(rows: ApiRow[]) {
  const safe = Array.isArray(rows) ? rows : [];

  const map = new Map<string, number>();
  for (const r of safe) {
    const label = codeToLabel(r.code);
    if (!label) continue;
    const v = Number(r.setupSec) || 0;
    if (v <= 0) continue;
    map.set(label, (map.get(label) || 0) + v);
  }

  const total = Array.from(map.values()).reduce((a, b) => a + b, 0);

  if (map.size === 0 || total <= 0) {
    return {
      total: 0,
      series: [{ label: "No Data", value: 1, pct: 100, color: "#E5ECE8" }],
      legend: [{ label: "No Data", sec: 0, pct: 100, color: "#E5ECE8" }],
    };
  }

  const list = Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const series = list.map((it, idx) => ({
    label: it.label,
    value: it.value,
    pct: (it.value / total) * 100,
    color: COLORS[idx % COLORS.length],
  }));

  const legend = series.map((it) => ({ label: it.label, sec: it.value, pct: it.pct, color: it.color }));
  return { total, series, legend };
}

/** ✅ merge ASSY+ST+INJ -> DETAIL */
function mergeForDetail(assy: ApiRow[], st: ApiRow[], inj: ApiRow[]): ApiRow[] {
  const map = new Map<string, number>();

  const add = (rows: ApiRow[]) => {
    for (const r of rows || []) {
      const label = codeToLabel(r.code);
      if (!label) continue;
      const v = Number(r.setupSec) || 0;
      if (v <= 0) continue;
      map.set(label, (map.get(label) || 0) + v);
    }
  };

  add(assy);
  add(st);
  add(inj);

  const reverse = new Map<string, string>();
  for (const [k, v] of Object.entries(RJT_REASON_MASTER)) reverse.set(v, k);

  return Array.from(map.entries()).map(([label, setupSec]) => ({
    code: reverse.get(label) ?? "",
    setupSec,
    ymd: "",
    view: "current",
    line: "DETAIL",
  }));
}

/** ✅ Simple SVG Pie + Tooltip hover */
function Pie({
  items,
  size = 220,
}: {
  items: Array<{ label: string; value: number; pct: number; color: string }>;
  size?: number;
}) {
  const r = size / 2;
  const cx = r;
  const cy = r;

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number }>({ x: cx, y: cy });

  const paths = useMemo(() => {
    const total = items.reduce((a, b) => a + b.value, 0) || 1;
    let start = -Math.PI / 2;

    return items.map((it) => {
      const angle = (it.value / total) * Math.PI * 2;
      const end = start + angle;

      const x1 = cx + r * Math.cos(start);
      const y1 = cy + r * Math.sin(start);
      const x2 = cx + r * Math.cos(end);
      const y2 = cy + r * Math.sin(end);

      const large = angle > Math.PI ? 1 : 0;
      const d = [`M ${cx} ${cy}`, `L ${x1} ${y1}`, `A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`, "Z"].join(" ");

      const mid = start + angle / 2;
      const lx = cx + r * 0.65 * Math.cos(mid);
      const ly = cy + r * 0.65 * Math.sin(mid);

      start = end;
      return { d, pct: it.pct, labelPos: { x: lx, y: ly } };
    });
  }, [items, cx, cy, r]);

  const hovered = hoverIdx != null ? items[hoverIdx] : null;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      onMouseMove={(e) => {
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
      onMouseLeave={() => setHoverIdx(null)}
      style={{ cursor: hoverIdx != null ? "pointer" : "default" }}
    >
      <circle cx={cx} cy={cy} r={r} fill="#fff" stroke={GREEN.border} strokeWidth={1} />

      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill={items[i].color}
          opacity={0.92}
          stroke="#fff"
          strokeWidth={1}
          onMouseEnter={() => setHoverIdx(i)}
          style={{
            transition: "transform 120ms ease, opacity 120ms ease",
            transformOrigin: `${cx}px ${cy}px`,
            transform: hoverIdx === i ? "scale(1.02)" : "scale(1)",
            opacity: hoverIdx === i ? 1 : 0.92,
          }}
        />
      ))}

      {/* angka persen di slice (tetap) */}
      {paths.map((p, i) => {
        if (p.pct < 6) return null;
        return (
          <text
            key={`t-${i}`}
            x={p.labelPos.x}
            y={p.labelPos.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="10"
            fill="#111827"
            style={{ userSelect: "none", pointerEvents: "none" }}
          >
            {Math.round(p.pct)}%
          </text>
        );
      })}

      {/* ✅ Tooltip hover */}
      {hovered ? (
        <foreignObject
          x={Math.min(Math.max(mouse.x + 10, 0), size - 140)}
          y={Math.min(Math.max(mouse.y + 10, 0), size - 40)}
          width={140}
          height={40}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              background: "rgba(15, 23, 42, 0.92)",
              color: "white",
              borderRadius: 10,
              padding: "8px 10px",
              fontSize: 12,
              lineHeight: "14px",
              boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={`${hovered.label} ${hovered.pct.toFixed(0)}%`}
          >
            <span style={{ fontWeight: 700 }}>{hovered.label}</span> {Math.round(hovered.pct)}%
          </div>
        </foreignObject>
      ) : null}
    </svg>
  );
}

export default function DowntimePage() {
  const searchParams = useSearchParams();

  const urlView = useMemo(() => {
    const v = (searchParams.get("view") || "current").toLowerCase();
    return v === "yesterday" ? "yesterday" : "current";
  }, [searchParams]);

  const [requestView, setRequestView] = useState<ViewMode>(urlView);
  const [shownView, setShownView] = useState<ViewMode>(urlView);

  useEffect(() => {
    setRequestView(urlView);
    setShownView(urlView);
  }, [urlView]);

  const setViewAndUrl = (v: ViewMode) => {
    setRequestView(v);
    const url = v === "yesterday" ? "/downtime?view=yesterday" : "/downtime";
    window.history.replaceState(null, "", url);
  };

  const assyUrl = useMemo(() => `/api/downtime?mode=dept&line=ASSY&view=${requestView}`, [requestView]);
  const stUrl = useMemo(() => `/api/downtime?mode=dept&line=ST&view=${requestView}`, [requestView]);
  const injUrl = useMemo(() => `/api/downtime?mode=dept&line=INJECTION&view=${requestView}`, [requestView]);

  const swrOpt = { refreshInterval: 15000, keepPreviousData: true as const };
  const assy = useSWR<ApiRow[]>(assyUrl, fetcher, swrOpt);
  const st = useSWR<ApiRow[]>(stUrl, fetcher, swrOpt);
  const inj = useSWR<ApiRow[]>(injUrl, fetcher, swrOpt);

  const reqAssy = Array.isArray(assy.data) ? assy.data : [];
  const reqSt = Array.isArray(st.data) ? st.data : [];
  const reqInj = Array.isArray(inj.data) ? inj.data : [];

  const cacheRef = useRef<Record<ViewMode, { ASSY: ApiRow[]; ST: ApiRow[]; INJECTION: ApiRow[] }>>({
    current: { ASSY: [], ST: [], INJECTION: [] },
    yesterday: { ASSY: [], ST: [], INJECTION: [] },
  });

  useEffect(() => {
    const hasSome = assy.data !== undefined && st.data !== undefined && inj.data !== undefined;
    if (!hasSome) return;

    cacheRef.current[requestView] = {
      ASSY: reqAssy,
      ST: reqSt,
      INJECTION: reqInj,
    };
  }, [requestView, assy.data, st.data, inj.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const allDone = !assy.isValidating && !st.isValidating && !inj.isValidating;
    const allKnown = assy.data !== undefined && st.data !== undefined && inj.data !== undefined;
    if (allDone && allKnown) setShownView(requestView);
  }, [requestView, assy.isValidating, st.isValidating, inj.isValidating, assy.data, st.data, inj.data]);

  const shown = cacheRef.current[shownView];
  const shownAssy = shown.ASSY || [];
  const shownSt = shown.ST || [];
  const shownInj = shown.INJECTION || [];

  const ymd = useMemo(() => shownAssy?.[0]?.ymd || shownSt?.[0]?.ymd || shownInj?.[0]?.ymd || "", [shownAssy, shownSt, shownInj]);

  const dataMap = useMemo(() => {
    const map: Record<string, ApiRow[]> = { ASSY: shownAssy, ST: shownSt, INJECTION: shownInj };
    map["DETAIL"] = mergeForDetail(shownAssy, shownSt, shownInj);
    return map;
  }, [shownAssy, shownSt, shownInj]);

  const isSwitching = requestView !== shownView;

  return (
    <Shell>
      <div className="p-4 sm:p-8 space-y-6">
        <div
          className="rounded-2xl px-4 py-2 w-fit text-xs sm:text-sm font-semibold"
          style={{ background: GREEN.soft, color: GREEN.base, boxShadow: `0 0 0 1px ${GREEN.ring} inset` }}
        >
          Downtime Departement
        </div>

        <div
          className="rounded-2xl border p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          style={{ borderColor: GREEN.border, background: GREEN.card }}
        >
          <div>
            <div className="text-sm font-semibold" style={{ color: GREEN.text }}>
              Downtime
            </div>
            <div className="text-xs" style={{ color: GREEN.dim }}>
              View: <span className="font-medium">{shownView === "current" ? "Current" : "Yesterday"}</span>
              {ymd ? (
                <>
                  {" "}
                  • Date: <span className="font-medium">{fmtYmd(ymd)}</span>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setViewAndUrl("current")}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition ${
                requestView === "current"
                  ? "bg-[#0E7B4A] hover:bg-[#0E7B4A]/90 text-white border-[#0E7B4A]"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              Current
            </button>

            <button
              onClick={() => setViewAndUrl("yesterday")}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition ${
                requestView === "yesterday"
                  ? "bg-[#0E7B4A] hover:bg-[#0E7B4A]/90 text-white border-[#0E7B4A]"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              Yesterday
            </button>

            {isSwitching ? (
              <div
                className="text-xs px-3 py-2 rounded-xl font-medium"
                style={{ background: "#F3F7F5", color: GREEN.sage, boxShadow: `0 0 0 1px ${GREEN.ring} inset` }}
              >
                Updating...
              </div>
            ) : null}
          </div>
        </div>

        <div className={`transition-opacity duration-300 ${isSwitching ? "opacity-60" : "opacity-100"}`} style={{ willChange: "opacity" }}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {CHARTS.map((c) => {
              const rows = dataMap[c.line] || [];
              const built = buildSeries(rows);

              return (
                <Card key={c.line} title={c.title} subtitle={`Total: ${fmtDurFromSec(built.total)}`}>
                  <div className="flex flex-col items-center gap-3">
                    <Pie items={built.series} size={220} />

                    <div className="w-full space-y-1">
                      {built.legend.map((l, i) => (
                        <div
                          key={`${l.label}-${i}`}
                          className="flex items-center justify-between text-[11px] px-2 py-1 rounded-lg"
                          style={{ background: GREEN.soft }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} />
                            <span className="truncate" style={{ color: GREEN.text }}>
                              {l.label}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-medium" style={{ color: GREEN.text }}>
                              {clamp(l.pct, 0, 100).toFixed(1)}%
                            </span>
                            <span style={{ color: GREEN.dim }}>{fmtDurFromSec(l.sec)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </Shell>
  );
}
