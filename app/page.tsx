// app/page.tsx
"use client";

import useSWR, { useSWRConfig } from "swr";
import Link from "next/link";
import Shell from "@/components/shell";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import IssueChartEditorModal from "@/components/IssueChartEditorModal";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type DashboardRow = {
  dept: string;
  qty_seihan: number;
  qty_aktual: number;

  // ✅ NEW: total downtime per dept (detik) -> hasil akumulasi downtime per line
  lineStopSec?: number | null;
};

type DashboardResponse = {
  shift: number; // boleh tetap ada, tapi tidak dipakai
  baseYmd: string;
  yesterdayYmd: string;
  selectedYmd: string;
  view: "current" | "yesterday";
  rows: DashboardRow[];
};

// ✅ NEW: KPI type
type KpiGroup = "MAIN_KPI" | "SUB_KPI" | "PROCESS_KPI" | "BIRA" | "UNSET";

type IssueRow = {
  id: number;
  dept: string;

  // ✅ NEW: kpi_group dari DB
  kpi_group?: string | null;

  file_name: string;
  file_path: string | null;
  cover_name: string | null;
  cover_path: string | null;

  // ✅ pastikan API mengirim uploadedAt (alias dari uploaded_at)
  uploadedAt?: string;
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

function formatNumber(n: number | string | null | undefined) {
  if (n == null) return "-";
  const num = Number(n);
  if (Number.isNaN(num)) return "-";
  return num.toLocaleString("en-US");
}

// ✅ NEW: format detik -> "H:MM" (contoh 300 sec -> 0:05)
function formatSecToHHMM(secAny: any) {
  const sec = Number(secAny);
  if (!Number.isFinite(sec) || sec <= 0) return "0:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

/* ========= GAUGE ========= */
function HalfGauge({ percent, color }: GaugeProps) {
  const raw = Number.isFinite(percent) ? percent : 0;
  const clamped = Math.max(0, Math.min(100, raw));
  const cfg = GAUGE_COLORS[color];

  const radius = 80;
  const circumference = Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const rotation = (clamped / 100) * 180 - 90;

  return (
    <div className="relative flex flex-col items-center pt-1 w-full">
      <svg
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
        <circle
          cx="100"
          cy="30"
          r="3"
          fill="#111827"
          style={{
            transformOrigin: "100px 100px",
            transform: `rotate(${rotation}deg)`,
            transition: "transform 0.7s ease-out",
          }}
        />
      </svg>

      <div
        className={`-mt-6 text-3xl md:text-4xl font-extrabold tracking-tight ${cfg.text}`}
      >
        {Math.round(raw)}%
      </div>
    </div>
  );
}

/* ========= CARD DEPT ========= */
function DeptCard({
  dept,
  target,
  actual,
  lineStopSec,
  color,
  href,
}: {
  dept: string;
  target: number;
  actual: number;
  lineStopSec?: number | null;
  color: GaugeColor;
  href: string;
}) {
  const percent = target > 0 ? (actual / target) * 100 : 0;

  const gap = target || actual ? actual - target : null;
  const gapAbs = gap == null ? null : Math.abs(gap);

  const gapColor =
    gap == null
      ? "text-gray-700"
      : gap === 0
      ? "text-emerald-600"
      : "text-red-500";

  const gapText =
    gap == null || gapAbs == null
      ? "-"
      : gap < 0
      ? `-${formatNumber(gapAbs)}`
      : formatNumber(gapAbs);

  // ✅ NEW: Line Stop (HH:mm) dari total downtime detik (akumulasi semua line di dept)
  const lineStopHHMM = formatSecToHHMM(lineStopSec ?? 0);

  return (
    <Link href={href} className="block group cursor-pointer h-full">
      <div className="bg-white/95 border border-slate-200 rounded-3xl px-6 py-5 flex flex-col gap-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)] h-full transition-transform duration-300 ease-in-out group-hover:scale-[1.02] group-hover:shadow-lg">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-gray-800 group-hover:text-[#0E7B4A]/80 transition-colors">
            {dept}
          </h3>
        </div>

        <div className="flex justify-center w-full">
          <HalfGauge percent={percent} color={color} />
        </div>

        <div className="w-full border-t border-gray-200" />

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
            <div className={`font-medium tracking-tight ${gapColor}`}>
              {gapText}
            </div>
          </div>

          {/* ✅ NEW: Line Stop (HH:mm) */}
          <div>
            <div className="font-semibold">Line Stop (HH:mm)</div>
            <div className="font-medium tracking-tight">{lineStopHHMM}</div>
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ========= HALAMAN DASHBOARD ========= */
export default function Page() {
  const { mutate } = useSWRConfig();
  const searchParams = useSearchParams();

  const [selectedIssue, setSelectedIssue] = useState<IssueRow | null>(null);

  // ✅ ambil view dari URL dashboard (/?view=yesterday)
  const urlView = useMemo(() => {
    const v = (searchParams.get("view") || "current").toLowerCase();
    return v === "yesterday" ? "yesterday" : "current";
  }, [searchParams]);

  // ✅ state view tetap dipakai untuk tombol
  const [view, setView] = useState<"current" | "yesterday">(urlView);

  // ✅ kalau balik dari line (URL berubah), sinkronkan state
  useEffect(() => {
    setView(urlView);
  }, [urlView]);

  // ✅ saat klik tombol, update state + URL (biar konsisten)
  const setViewAndUrl = (v: "current" | "yesterday") => {
    setView(v);
    const url = v === "yesterday" ? "/?view=yesterday" : "/";
    window.history.replaceState(null, "", url);
  };

  const dashboardUrl = useMemo(() => `/api/dashboard?view=${view}`, [view]);

  const { data, isLoading, error } = useSWR<DashboardResponse>(
    dashboardUrl,
    fetcher,
    {
      refreshInterval: 15000,
    }
  );

  const { data: issuesData } = useSWR<IssueRow[]>("/api/asakai-list", fetcher, {
    refreshInterval: 15000,
  });

  const issues = Array.isArray(issuesData) ? issuesData : [];

  const colorByDept: Record<string, GaugeColor> = {
    INJECTION: "yellow",
    ST: "blue",
    ASSY: "red",
  };

  // ✅ NEW: style beda per dept (buat card group KPI)
  const DEPT_STYLES: Record<
    string,
    { border: string; pillBg: string; pillText: string; dot: string }
  > = {
    QUALITY: {
      border: "#0E7B4A",
      pillBg: "#E9F4EE",
      pillText: "#0E7B4A",
      dot: "#0E7B4A",
    },
    INJECTION: {
      border: "#f4b41a",
      pillBg: "rgba(244,180,26,0.12)",
      pillText: "#a16207",
      dot: "#f4b41a",
    },
    ST: {
      border: "#2563eb",
      pillBg: "rgba(37,99,235,0.10)",
      pillText: "#2563eb",
      dot: "#2563eb",
    },
    ASSY: {
      border: "#dc2626",
      pillBg: "rgba(220,38,38,0.10)",
      pillText: "#dc2626",
      dot: "#dc2626",
    },
  };

  // ✅ sudah benar: lempar view ke page line
  const routesByDept: Record<string, string> = {
    INJECTION: `/injection?view=${view}`,
    ST: `/st?view=${view}`,
    ASSY: `/assy?view=${view}`,
  };

  const orderedDepts = ["INJECTION", "ST", "ASSY"];
  const safeRows = Array.isArray(data?.rows) ? data!.rows : [];

  const rows = orderedDepts.map((deptName) => {
    const found = safeRows.find((r) => r.dept === deptName);
    if (found) return found;
    return { dept: deptName, qty_seihan: 0, qty_aktual: 0, lineStopSec: 0 };
  });

  const selectedLabel = view === "current" ? "Current" : "Kemarin";
  const selectedYmd = data?.selectedYmd || "-";

  const getFileUrl = (f: IssueRow) => f.file_path || "";
  const getCoverUrl = (f: IssueRow) => f.cover_path || f.file_path || "";

  const openIssue = (f: IssueRow) => {
    const url = getFileUrl(f);
    if (!url) {
      alert("File tidak ditemukan.");
      return;
    }
    const lower = url.toLowerCase();
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      setSelectedIssue(f);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDelete = async (id: number) => {
    const ok = window.confirm("Yakin hapus issue ini?");
    if (!ok) return;

    try {
      const res = await fetch(`/api/asakai/${id}`, { method: "DELETE" });

      if (!res.ok) {
        console.error("Gagal delete", await res.text());
        alert("Gagal menghapus issue.");
        return;
      }

      mutate("/api/asakai-list");
    } catch (err) {
      console.error("Error delete:", err);
      alert("Terjadi error saat menghapus issue.");
    }
  };

  // ✅ NEW: helper normalisasi KPI
  const normKpi = (v: any): KpiGroup => {
    const s = (v ?? "").toString().trim().toUpperCase();
    if (s === "MAIN_KPI") return "MAIN_KPI";
    if (s === "SUB_KPI") return "SUB_KPI";
    if (s === "PROCESS_KPI") return "PROCESS_KPI";
    if (s === "BIRA") return "BIRA";
    return "UNSET";
  };

  // ✅ NEW: label KPI
  const kpiLabel: Record<KpiGroup, string> = {
    MAIN_KPI: "Main KPI",
    SUB_KPI: "Sub KPI",
    PROCESS_KPI: "Process KPI",
    BIRA: "BIRA",
    UNSET: "Lainnya",
  };

  // ✅ NEW: urutan KPI tampil
  const KPI_ORDER: KpiGroup[] = [
    "MAIN_KPI",
    "SUB_KPI",
    "PROCESS_KPI",
    "BIRA",
    "UNSET",
  ];

  // ✅ NEW: grouping dept -> kpi -> issues[]
  const issuesByDeptKpi: Record<string, Record<KpiGroup, IssueRow[]>> = {};
  for (const issue of issues) {
    const deptKey =
      issue.dept && issue.dept.trim() ? issue.dept.trim() : "Lainnya";
    const kpiKey = normKpi(issue.kpi_group);

    if (!issuesByDeptKpi[deptKey])
      issuesByDeptKpi[deptKey] = {
        MAIN_KPI: [],
        SUB_KPI: [],
        PROCESS_KPI: [],
        BIRA: [],
        UNSET: [],
      };

    issuesByDeptKpi[deptKey][kpiKey].push(issue);
  }

  const groupedDeptNames = Object.keys(issuesByDeptKpi).sort();

  return (
    <Shell>
      {error && (
        <div className="p-4 text-red-500 bg-red-50 rounded mb-4">
          Gagal mengambil data database
        </div>
      )}

      {isLoading && (
        <div className="mt-10 text-center text-gray-500 text-sm animate-pulse">
          Sedang memuat data produksi...
        </div>
      )}

      {!isLoading && (
        <>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => setViewAndUrl("current")}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition
                ${
                  view === "current"
                    ? "bg-[#0E7B4A] hover:bg-[#0E7B4A]/90 text-white border-[#0E7B4A]"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
            >
              Current
            </button>

            <button
              onClick={() => setViewAndUrl("yesterday")}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition
                ${
                  view === "yesterday"
                    ? "bg-[#0E7B4A] hover:bg-[#0E7B4A]/90 text-white border-[#0E7B4A]"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
            >
              Yesterday
            </button>
          </div>

          {/* ✅ SHIFT DIHILANGKAN, TINGGAL TANGGAL */}
          <div className="mt-2 text-sm text-slate-600">
            <span className="font-semibold">{selectedLabel}:</span>{" "}
            <span className="font-mono">{selectedYmd}</span>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-5">
            {rows.map((row) => (
              <DeptCard
                key={row.dept}
                dept={row.dept}
                target={row.qty_seihan}
                actual={row.qty_aktual}
                lineStopSec={row.lineStopSec ?? 0} // ✅ NEW
                color={colorByDept[row.dept] ?? "yellow"}
                href={routesByDept[row.dept] ?? "/injection"}
              />
            ))}
          </div>

          {/* ====== ISSUE (terkelompok KPI) ====== */}
          <div className="mt-10 space-y-4 bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">KPI DEPARTEMENT</h3>
            </div>

            {issues.length === 0 ? (
              <div className="text-sm text-slate-500">Belum ada issue.</div>
            ) : (
              <div className="space-y-8">
                {groupedDeptNames.map((deptName) => {
                  const byKpi = issuesByDeptKpi[deptName];

                  const s =
                    DEPT_STYLES[deptName] ?? {
                      border: "#CBD5E1",
                      pillBg: "#F1F5F9",
                      pillText: "#334155",
                      dot: "#64748B",
                    };

                  return (
                    <div
                      key={deptName}
                      className="rounded-2xl border bg-white p-4 sm:p-5 space-y-4"
                      style={{
                        borderColor: "#E2E8F0",
                        boxShadow: "0 8px 22px rgba(15,23,42,0.05)",
                      }}
                    >
                      {/* Header dept */}
                      <div className="flex items-center justify-between gap-3">
                        <div
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold"
                          style={{
                            background: s.pillBg,
                            color: s.pillText,
                            boxShadow: `0 0 0 1px ${s.border} inset`,
                          }}
                        >
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ background: s.dot }}
                          />
                          {deptName}
                        </div>

                        <div
                          className="h-2 w-16 rounded-full"
                          style={{ background: s.pillBg }}
                        />
                      </div>

                      {/* ✅ tampil per KPI group */}
                      <div className="space-y-6">
                        {KPI_ORDER.map((kpiKey) => {
                          const deptIssues = byKpi?.[kpiKey] ?? [];
                          if (deptIssues.length === 0) return null;

                          return (
                            <div key={kpiKey} className="space-y-2">
                              <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                                {kpiLabel[kpiKey]}
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                                {deptIssues.map((f) => {
                                  const coverSrc = getCoverUrl(f);

                                  const dateText = f.uploadedAt
                                    ? new Date(f.uploadedAt).toLocaleString(
                                        "id-ID"
                                      )
                                    : "-";

                                  return (
                                    <div
                                      key={f.id}
                                      className="bg-white rounded-xl border border-slate-200 hover:shadow-md transition overflow-hidden flex flex-col"
                                      title={f.file_name}
                                      style={{
                                        boxShadow:
                                          "0 10px 20px rgba(15,23,42,0.04)",
                                      }}
                                    >
                                      {/* ✅ header tipis aksen per dept */}
                                      <div
                                        className="h-1.5 w-full"
                                        style={{ background: s.border }}
                                      />

                                      <div className="w-full h-48 bg-slate-100 relative group">
                                        {coverSrc ? (
                                          <img
                                            src={coverSrc}
                                            alt={`cover-${f.file_name}`}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                              const img = e.currentTarget;
                                              img.style.display = "none";
                                              img.insertAdjacentHTML(
                                                "afterend",
                                                `<div class='w-full h-full flex items-center justify-center text-slate-400'>
                                                  <svg class='w-16 h-16' viewBox='0 0 24 24' fill='none' stroke='currentColor'>
                                                    <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2'
                                                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                                                  </svg>
                                                </div>`
                                              );
                                            }}
                                          />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center text-slate-400">
                                            <svg
                                              className="w-16 h-16"
                                              viewBox="0 0 24 24"
                                              fill="none"
                                              stroke="currentColor"
                                            >
                                              <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth="2"
                                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                              />
                                            </svg>
                                          </div>
                                        )}

                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                                          <div className="w-full text-white">
                                            <div className="text-sm font-medium truncate">
                                              {f.file_name}
                                            </div>
                                            <div className="text-xs opacity-75">
                                              {dateText}
                                            </div>
                                          </div>
                                        </div>
                                      </div>

                                      <div className="p-4 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="flex items-center gap-2 text-xs font-medium">
                                            <span
                                              className="h-2.5 w-2.5 rounded-full"
                                              style={{ background: s.dot }}
                                            />
                                            <span style={{ color: s.pillText }}>
                                              {f.dept || "File"}
                                            </span>
                                          </div>

                                          {/* ✅ tanggal selalu tampil */}
                                          <div className="text-[11px] text-slate-500">
                                            {dateText}
                                          </div>
                                        </div>

                                        <div className="mt-3 flex items-center gap-2">
                                          <button
                                            onClick={() => openIssue(f)}
                                            className="flex-1 p-2 rounded-md bg-[#0E7B4A]/10 hover:bg-[#0E7B4A]/20 text-[#0E7B4A]
                                                      text-sm flex items-center justify-center gap-2 transition-colors"
                                            title="Open / View"
                                          >
                                            <svg
                                              className="w-4 h-4"
                                              viewBox="0 0 24 24"
                                              fill="none"
                                              stroke="currentColor"
                                            >
                                              <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth="2"
                                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                              />
                                              <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth="2"
                                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                              />
                                            </svg>
                                            Buka
                                          </button>

                                          <a
                                            href={getFileUrl(f) || "#"}
                                            download={f.file_name || undefined}
                                            className="flex-1 p-2 rounded-md bg-[#6C8B7B]/10 hover:bg-[#6C8B7B]/20 text-[#6C8B7B]
                                                      text-sm flex items-center justify-center gap-2 transition-colors"
                                            title="Download"
                                          >
                                            <svg
                                              className="w-4 h-4"
                                              viewBox="0 0 24 24"
                                              fill="none"
                                              stroke="currentColor"
                                            >
                                              <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth="2"
                                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                              />
                                            </svg>
                                            Unduh
                                          </a>

                                          <button
                                            onClick={() => handleDelete(f.id)}
                                            className="p-2 rounded-md bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                                            title="Delete"
                                          >
                                            <svg
                                              className="w-4 h-4"
                                              viewBox="0 0 24 24"
                                              fill="none"
                                              stroke="currentColor"
                                            >
                                              <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth="2"
                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                              />
                                            </svg>
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      <IssueChartEditorModal
        open={!!selectedIssue}
        issueId={selectedIssue ? selectedIssue.id : null}
        onClose={() => setSelectedIssue(null)}
      />
    </Shell>
  );
}
