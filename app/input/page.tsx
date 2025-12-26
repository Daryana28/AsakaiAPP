// app/input/page.tsx
"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import Shell from "@/components/shell"; // ⬅️ dibungkus Shell

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

type Dept =
  | "HSE"
  | "PPC"
  | "QUALITY CUSTOMER"
  | "LOGISTIC"
  | "MOLD MAINTANANCE"
  | "MACHINE MAINTENANCE"
  | "ASSY MAINTANANCE"
  | "PRODUCTION ENGINERING"
  | "INJECTION"
  | "SURFACE TREATMENT"
  | "ASSEMBLY"
  | "QUALITY"
  | "PURCHASING";

const DEPTS: { value: Dept; label: string }[] = [
  { value: "HSE", label: "HSE" },
  { value: "PPC", label: "PPC" },
  { value: "QUALITY CUSTOMER", label: "Quality Customer" },
  { value: "LOGISTIC", label: "Logistic" },
  { value: "MOLD MAINTANANCE", label: "Mold Maintenance" },
  { value: "MACHINE MAINTENANCE", label: "Machine Maintenance" },
  { value: "ASSY MAINTANANCE", label: "Assy Maintenance" },
  { value: "PRODUCTION ENGINERING", label: "Production Enginering" },
  { value: "INJECTION", label: "Injection" },
  { value: "SURFACE TREATMENT", label: "Surface Treatment" },
  { value: "ASSEMBLY", label: "Assembly" },
  { value: "QUALITY", label: "Quality" },
  { value: "PURCHASING", label: "Purchasing" },
];

// ✅ NEW: KPI Group
type KpiGroup = "MAIN_KPI" | "SUB_KPI" | "PROCESS_KPI" | "BIRA";
const KPI_GROUPS: { value: KpiGroup; label: string }[] = [
  { value: "MAIN_KPI", label: "Main KPI" },
  { value: "SUB_KPI", label: "Sub KPI" },
  { value: "PROCESS_KPI", label: "Process KPI" },
  { value: "BIRA", label: "BIRA" },
];

export default function InputAsakai() {
  const [dept, setDept] = useState<Dept | "">("");

  // ✅ NEW: KPI Group state
  const [kpiGroup, setKpiGroup] = useState<KpiGroup | "">("");

  const [file, setFile] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [imgPreview, setImgPreview] = useState<string | null>(null);

  const isExcel = file ? /\.(xlsx|xls)$/i.test(file.name) : false;

  const summary = useMemo(() => {
    const c = { Safety: 0, BNF: 0, RIL: 0, Delivery: 0 } as Record<
      string,
      number
    >;
    rows.forEach((r) => {
      const k = (r.Category || "").trim();
      if (k in c) c[k] += 1;
    });
    return c;
  }, [rows]);

  const pickMain = async (f: File) => {
    setFile(f);
    setRows([]);
    setMsg("");

    if (/\.(png|jpe?g|webp)$/i.test(f.name)) {
      const url = URL.createObjectURL(f);
      setImgPreview(url);
    } else {
      setImgPreview(null);
    }

    if (/\.(xlsx|xls)$/i.test(f.name)) {
      try {
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: "" });
        setRows(data);
      } catch {
        setMsg("❌ Gagal membaca Excel.");
      }
    }
  };

  const upload = async () => {
    if (!dept) return setMsg("❌ Pilih departemen dulu.");
    // ✅ NEW: wajib pilih KPI group
    if (!kpiGroup) return setMsg("❌ Pilih KPI group dulu.");
    if (!file) return setMsg("❌ Pilih file utama dulu.");

    setBusy(true);
    setMsg("");

    try {
      const fd = new FormData();
      fd.append("dept", dept);

      // ✅ NEW: kirim KPI group
      fd.append("kpiGroup", kpiGroup);

      fd.append("file", file);
      if (cover) fd.append("cover", cover);

      const res = await fetch("/api/asakai-upload", {
        method: "POST",
        body: fd,
      });

      const j = await res.json();
      if (j.ok) {
        setMsg("✅ Berhasil upload.");
        setDept("");
        setKpiGroup(""); // ✅ NEW: reset
        setFile(null);
        setCover(null);
        setRows([]);
        setImgPreview(null);
      } else {
        setMsg("❌ Gagal upload.");
      }
    } catch {
      setMsg("❌ Gagal koneksi ke server.");
    } finally {
      setBusy(false);
    }
  };

  const ringStyle = { boxShadow: `0 0 0 1px ${GREEN.ring} inset` };

  return (
    <Shell>
      <div className="p-4 sm:p-8 space-y-6">
        {/* Header */}
        <div
          className="rounded-2xl px-4 py-2 w-fit text-xs sm:text-sm font-semibold"
          style={{
            background: GREEN.soft,
            color: GREEN.base,
            boxShadow: `0 0 0 1px ${GREEN.ring} inset`,
          }}
        >
          Laporkan Issue
        </div>

        <div
          className="rounded-2xl border p-4 sm:p-6 space-y-5"
          style={{ borderColor: GREEN.border, background: GREEN.card }}
        >
          <p className="text-sm" style={{ color: GREEN.dim }}>
            Silahkan pilih sesuai departement :
          </p>

          {/* Controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
            {/* Departemen */}
            <label className="text-sm w-full sm:w-auto">
              <div className="mb-1 font-medium" style={{ color: GREEN.text }}>
                Departemen
              </div>
              <select
                value={dept}
                onChange={(e) => setDept(e.target.value as Dept | "")}
                className="rounded-lg px-3 py-2 w-full sm:min-w-[260px] bg-white outline-none focus:ring-2"
                style={{
                  border: `1px solid ${GREEN.border}`,
                  boxShadow: `0 0 0 1px ${GREEN.ring} inset`,
                }}
              >
                <option value="">— Pilih departemen —</option>
                {DEPTS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>

            {/* ✅ NEW: KPI Group */}
            <label className="text-sm w-full sm:w-auto">
              <div className="mb-1 font-medium" style={{ color: GREEN.text }}>
                KPI Group
              </div>
              <select
                value={kpiGroup}
                onChange={(e) => setKpiGroup(e.target.value as KpiGroup | "")}
                className="rounded-lg px-3 py-2 w-full sm:min-w-[220px] bg-white outline-none focus:ring-2"
                style={{
                  border: `1px solid ${GREEN.border}`,
                  boxShadow: `0 0 0 1px ${GREEN.ring} inset`,
                }}
              >
                <option value="">— Pilih KPI Group —</option>
                {KPI_GROUPS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>

            {/* Upload file utama */}
            <label
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl cursor-pointer transition w-full sm:w-auto justify-start"
              style={{
                background: "#F3F7F5",
                boxShadow: `0 0 0 1px ${GREEN.ring} inset`,
                color: GREEN.text,
              }}
              title="Pilih Excel / PDF / Word / Gambar"
            >
              <input
                type="file"
                accept=".xlsx,.xls,.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={(e) => e.target.files && pickMain(e.target.files[0])}
              />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                  stroke="#0E7B4A"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M14 2v6h6"
                  stroke="#0E7B4A"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M9 13h6"
                  stroke="#0E7B4A"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M9 17h6"
                  stroke="#0E7B4A"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="font-medium text-sm sm:text-base">
                Upload File
              </span>
            </label>

            {/* Upload cover (opsional) */}
            <label
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl cursor-pointer transition w-full sm:w-auto justify-start"
              style={{
                background: "#F3F7F5",
                boxShadow: `0 0 0 1px ${GREEN.ring} inset`,
                color: GREEN.text,
              }}
              title="Opsional – gambar cover untuk kartu"
            >
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={(e) => e.target.files && setCover(e.target.files[0])}
              />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="3"
                  y="7"
                  width="18"
                  height="13"
                  rx="2"
                  stroke="#0E7B4A"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M3 13l4-4 5 5 3-3 4 4"
                  stroke="#0E7B4A"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="8.5" cy="10.5" r="1" fill="#0E7B4A" />
              </svg>
              <span className="font-medium text-sm sm:text-base">
                Tambahkan Foto
              </span>
            </label>

            {/* Tombol kirim */}
            <button
              onClick={upload}
              disabled={busy || !dept || !kpiGroup || !file}
              className="px-5 py-2.5 rounded-xl font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed transition active:scale-[0.99] w-full sm:w-auto"
              style={{ background: GREEN.base }}
            >
              {busy ? "Mengunggah…" : "Kirim"}
            </button>
          </div>

          {/* Info file terpilih */}
          {file ? (
            <div
              className="rounded-xl px-4 py-2 text-xs sm:text-sm flex flex-wrap items-center gap-2"
              style={{ background: GREEN.soft, color: GREEN.base, ...ringStyle }}
            >
              <span className="font-semibold">File:</span>
              <span
                className="px-2 py-0.5 rounded-lg bg-white"
                style={ringStyle}
              >
                {file.name}
              </span>

              {/* ✅ NEW: tampilkan KPI group */}
              {kpiGroup && (
                <>
                  <span className="font-semibold ml-1">• KPI:</span>
                  <span
                    className="px-2 py-0.5 rounded-lg bg-white"
                    style={ringStyle}
                  >
                    {KPI_GROUPS.find((x) => x.value === kpiGroup)?.label ??
                      kpiGroup}
                  </span>
                </>
              )}

              {cover && (
                <>
                  <span className="font-semibold ml-1">• Cover:</span>
                  <span
                    className="px-2 py-0.5 rounded-lg bg-white"
                    style={ringStyle}
                  >
                    {cover.name}
                  </span>
                </>
              )}
            </div>
          ) : null}

          {/* Preview gambar saja (tanpa kartu Safety/BNF/RIL/Delivery & JSON) */}
          {imgPreview && (
            <div className="grid grid-cols-1 gap-5">
              <div
                className="rounded-xl overflow-hidden"
                style={{
                  border: `1px solid ${GREEN.border}`,
                  background: "#FFF",
                }}
              >
                <img
                  src={imgPreview}
                  className="w-full max-h-[360px] object-contain sm:object-cover"
                />
              </div>
            </div>
          )}

          {/* Message */}
          {msg && (
            <div
              className="rounded-xl px-4 py-2 text-sm"
              style={{
                background: msg.startsWith("✅") ? "#ECFDF5" : "#FEF2F2",
                color: msg.startsWith("✅") ? "#065F46" : "#991B1B",
                boxShadow: `0 0 0 1px ${
                  msg.startsWith("✅") ? "#A7F3D0" : "#FECACA"
                } inset`,
              }}
            >
              {msg}
            </div>
          )}
        </div>

        {/* Tips */}
        <div
          className="text-xs rounded-xl px-3 py-2 w-fit"
          style={{ background: "#F3F7F5", color: GREEN.sage, ...ringStyle }}
        >
          Tips: Pastikan data sesuai.
        </div>
      </div>
    </Shell>
  );
}
