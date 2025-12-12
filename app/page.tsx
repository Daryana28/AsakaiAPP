// app/page.tsx
"use client";

import useSWR, { useSWRConfig } from "swr";
import Link from "next/link";
import Shell from "@/components/shell";
import { useState } from "react";
import ExcelEditorModal from "@/components/ExcelEditorModal";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type DashboardRow = {
  dept: string;
  qty_seihan: number;
  qty_aktual: number;
};

type DashboardResponse = {
  shift: number;
  baseYmd: string;
  rows: DashboardRow[];
};

type IssueRow = {
  id: number;
  dept: string;
  file_name: string;
  file_path: string | null;
  cover_name: string | null;
  cover_path: string | null;
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

function formatNumber(n: number | null | undefined) {
  if (n == null) return "-";
  return n.toLocaleString("en-US");
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
  color,
  href,
}: {
  dept: string;
  target: number;
  actual: number;
  color: GaugeColor;
  href: string;
}) {
  const percent = target > 0 ? (actual / target) * 100 : 0;
  const gap = target || actual ? target - actual : null;

  return (
    <Link href={href} className="block group cursor-pointer h-full">
      <div className="bg-white/95 border border-slate-200 rounded-3xl px-6 py-5 flex flex-col gap-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)] h-full transition-transform duration-300 ease-in-out group-hover:scale-[1.02] group-hover:shadow-lg">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-gray-800 group-hover:text-blue-600 transition-colors">
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
            <div className="font-medium tracking-tight">
              {gap == null ? "-" : formatNumber(gap)}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ========= HALAMAN DASHBOARD ========= */
export default function Page() {
  const { mutate } = useSWRConfig();

  const [selectedIssue, setSelectedIssue] = useState<IssueRow | null>(null);

  const { data, isLoading, error } = useSWR<DashboardResponse>(
    "/api/dashboard",
    fetcher,
    { refreshInterval: 5000 }
  );

  const { data: issuesData } = useSWR<IssueRow[]>(
    "/api/asakai-list",
    fetcher,
    { refreshInterval: 10000 }
  );

  const issues = Array.isArray(issuesData) ? issuesData : [];

  const colorByDept: Record<string, GaugeColor> = {
    INJECTION: "yellow",
    ST: "blue",
    ASSY: "red",
  };

  const routesByDept: Record<string, string> = {
    INJECTION: "/injection",
    ST: "/st",
    ASSY: "/assy",
  };

  const orderedDepts = ["INJECTION", "ST", "ASSY"];
  const safeRows = Array.isArray(data?.rows) ? data!.rows : [];

  const rows = orderedDepts.map((deptName) => {
    const found = safeRows.find((r) => r.dept === deptName);
    if (found) return found;
    return { dept: deptName, qty_seihan: 0, qty_aktual: 0 };
  });

  const shiftLabel =
    data?.shift === 1 ? "Shift 1 (08:00 - 20:00)" : "Shift 2 (20:00 - 08:00)";

  // ==== helper untuk file & cover ====
  // File asli (Excel, PDF, dll) → dipakai untuk Open & Download
  const getFileUrl = (f: IssueRow) => f.file_path || "";

  // Gambar cover (thumbnail) → hanya untuk tampilan kartu
  const getCoverUrl = (f: IssueRow) => f.cover_path || f.file_path || "";

  const openIssue = (f: IssueRow) => {
    const url = getFileUrl(f);

    if (!url) {
      alert("File tidak ditemukan.");
      return;
    }

    const lower = url.toLowerCase();

    // Kalau Excel → buka modal editor
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      setSelectedIssue(f);
      return;
    }

    // Selain Excel → tetap buka tab baru
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDelete = async (id: number) => {
    const ok = window.confirm("Yakin hapus issue ini?");
    if (!ok) return;

    try {
      const res = await fetch(`/api/asakai/${id}`, {
        method: "DELETE",
      });

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

  // ==== kelompokkan issue per departemen ====
  const issuesByDept: Record<string, IssueRow[]> = {};
  for (const issue of issues) {
    const key = issue.dept && issue.dept.trim() ? issue.dept.trim() : "Lainnya";
    if (!issuesByDept[key]) issuesByDept[key] = [];
    issuesByDept[key].push(issue);
  }
  const groupedDeptNames = Object.keys(issuesByDept).sort(); // urut alfabet

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
          {/* Info Shift aktif */}
          <div className="mt-2 text-sm text-slate-600">
            <span className="font-semibold">Current:</span> {shiftLabel} | Base
            date D_YMD: <span className="font-mono">{data?.baseYmd}</span>
          </div>

          {/* ===== GAUGE DEPT ===== */}
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

          {/* ===== ISSUE ===== */}
          <div className="mt-10 space-y-4 bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">ISSUE</h3>
            </div>

            {issues.length === 0 ? (
              <div className="text-sm text-slate-500">Belum ada issue.</div>
            ) : (
              <div className="space-y-6">
                {groupedDeptNames.map((deptName) => {
                  const deptIssues = issuesByDept[deptName];
                  return (
                    <div key={deptName} className="space-y-2">
                      <div className="text-sm font-semibold text-slate-700">
                        {deptName}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                        {deptIssues.map((f) => {
                          const coverSrc = getCoverUrl(f);
                          return (
                            <div
                              key={f.id}
                              className="bg-white rounded-xl border border-slate-200 hover:shadow-md transition overflow-hidden flex flex-col"
                              title={f.file_name}
                            >
                              {/* Cover */}
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
                                      {f.uploadedAt
                                        ? new Date(
                                            f.uploadedAt
                                          ).toLocaleString("id-ID")
                                        : ""}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Info + Actions */}
                              <div className="p-4 flex-1">
                                <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium">
                                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                  {f.dept || "File"}
                                </div>
                                <div className="mt-3 flex items-center gap-2">
                                  {/* Buka */}
                                  <button
                                    onClick={() => openIssue(f)}
                                    className="flex-1 p-2 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-600 text-sm flex items-center justify-center gap-2 transition-colors"
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

                                  {/* Unduh */}
                                  <a
                                    href={getFileUrl(f) || "#"}
                                    download={f.file_name || undefined}
                                    className="flex-1 p-2 rounded-md bg-slate-50 hover:bg-slate-100 text-slate-600 text-sm flex items-center justify-center gap-2 transition-colors"
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

                                  {/* Delete */}
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
            )}
          </div>
        </>
      )}

      {/* Modal editor Excel */}
      <ExcelEditorModal
        open={!!selectedIssue}
        fileUrl={selectedIssue ? getFileUrl(selectedIssue) : ""}
        onClose={() => setSelectedIssue(null)}
      />
    </Shell>
  );
}
