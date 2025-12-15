"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type SheetResponse = {
  sheetNames: string[];
  activeSheet: string;
  aoa: any[][];
};

export default function IssueChartEditorModal({
  open,
  issueId,
  onClose,
}: {
  open: boolean;
  issueId: number | null;
  onClose: () => void;
}) {
  // ====== Excel state ======
  const [activeSheet, setActiveSheet] = useState<string>("");
  const [aoaEdit, setAoaEdit] = useState<any[][]>([]);
  const [editing, setEditing] = useState<{ r: number; c: number } | null>(null);

  // ====== Virtual rows state ======
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // (tuning) tinggi row fix biar gampang virtualize
  const ROW_H = 28; // px
  const OVERSCAN = 12; // render extra rows atas/bawah biar smooth

  const sheetUrl =
    open && issueId
      ? `/api/issues/${issueId}/sheet${
          activeSheet ? `?sheet=${encodeURIComponent(activeSheet)}` : ""
        }`
      : null;

  const {
    data: sheetData,
    isLoading: sheetLoading,
    mutate: mutateSheet,
  } = useSWR<SheetResponse>(sheetUrl, fetcher);

  useEffect(() => {
    if (!open) return;
    if (sheetData?.activeSheet) setActiveSheet(sheetData.activeSheet);
    if (Array.isArray(sheetData?.aoa)) setAoaEdit(sheetData.aoa);
    setEditing(null);

    // reset scroll saat ganti sheet / buka modal
    setScrollTop(0);
    if (viewportRef.current) viewportRef.current.scrollTop = 0;
  }, [open, sheetData?.activeSheet, sheetData?.aoa]);

  const colCount = useMemo(() => {
    if (!aoaEdit?.length) return 1;
    return Math.max(1, ...aoaEdit.map((r) => (r ? r.length : 0)));
  }, [aoaEdit]);

  const rowCount = aoaEdit?.length ?? 0;

  const setCellValue = (r: number, c: number, v: string) => {
    setAoaEdit((prev) => {
      const next = prev.map((row) => (row ? [...row] : []));
      if (!next[r]) next[r] = [];
      next[r][c] = v;
      return next;
    });
  };

  const addRow = () => setAoaEdit((p) => [...p, Array(colCount).fill("")]);

  const addCol = () =>
    setAoaEdit((prev) => {
      const next = prev.map((row) => {
        const r = row ? [...row] : [];
        r[colCount] = "";
        return r;
      });
      return next.length ? next : [Array(colCount + 1).fill("")];
    });

  const saveExcel = async () => {
    if (!issueId) return;

    const sheetName = activeSheet || sheetData?.activeSheet || "Sheet1";
    const res = await fetch(`/api/issues/${issueId}/sheet-save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetName, aoa: aoaEdit }),
    });

    if (!res.ok) {
      console.error(await res.text());
      alert("Gagal menyimpan Excel.");
      return;
    }

    alert("Excel tersimpan ✅");
    setEditing(null);
    mutateSheet();
  };

  if (!open) return null;

  const isCellEditing = (r: number, c: number) =>
    editing?.r === r && editing?.c === c;

  const startEdit = (r: number, c: number) => setEditing({ r, c });
  const stopEdit = () => setEditing(null);

  // ====== compute visible range ======
  const viewportH = 70 * 9; // approx; actual will be from container height, but ok as fallback
  const actualViewportH = viewportRef.current?.clientHeight ?? viewportH;

  const startRow = Math.max(
    0,
    Math.floor(scrollTop / ROW_H) - OVERSCAN
  );
  const endRow = Math.min(
    rowCount,
    Math.ceil((scrollTop + actualViewportH) / ROW_H) + OVERSCAN
  );

  const visibleRows = aoaEdit.slice(startRow, endRow);

  const topPad = startRow * ROW_H;
  const bottomPad = Math.max(0, (rowCount - endRow) * ROW_H);

  return (
    <div className="fixed inset-0 z-[999] bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <div className="font-semibold">Issue Viewer</div>
          <button
            onClick={() => {
              stopEdit();
              onClose();
            }}
            className="px-3 py-1 rounded-md bg-slate-100 hover:bg-slate-200"
          >
            Tutup
          </button>
        </div>

        {/* Tab (hanya Output File) */}
        <div className="px-4 pt-3 flex gap-2">
          <div className="px-3 py-1 rounded-md bg-slate-900 text-white">
            Output File
          </div>
        </div>

        <div className="p-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Sheet dropdown */}
              <select
                className="border rounded-md px-2 py-1 text-sm"
                value={activeSheet || sheetData?.activeSheet || ""}
                onChange={(e) => {
                  setEditing(null);
                  setActiveSheet(e.target.value);
                }}
              >
                {(sheetData?.sheetNames || []).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>

              <button
                onClick={addRow}
                className="px-3 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-sm"
              >
                + Row
              </button>

              <button
                onClick={addCol}
                className="px-3 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-sm"
              >
                + Col
              </button>

              <button
                onClick={saveExcel}
                className="px-3 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 text-sm"
              >
                Simpan Excel
              </button>

              <div className="text-xs text-slate-500">
                Double-click cell untuk edit. Enter untuk simpan cell.
              </div>
            </div>

            {sheetLoading ? (
              <div className="text-sm text-slate-500">Memuat Excel...</div>
            ) : rowCount === 0 ? (
              <div className="text-sm text-slate-500">
                Data Excel kosong / tidak terbaca.
              </div>
            ) : (
              <div
                ref={viewportRef}
                className="overflow-auto max-h-[70vh] border rounded-lg bg-white"
                onScroll={(e) => {
                  setScrollTop((e.currentTarget as HTMLDivElement).scrollTop);
                }}
              >
                {/* Padding atas */}
                {topPad > 0 && <div style={{ height: topPad }} />}

                <table className="text-xs border-collapse">
                  <tbody>
                    {visibleRows.map((row, i) => {
                      const r = startRow + i;
                      return (
                        <tr key={r} style={{ height: ROW_H }}>
                          {Array.from({ length: colCount }).map((_, c) => {
                            const value = row?.[c] ?? "";
                            const editingNow = isCellEditing(r, c);

                            return (
                              <td
                                key={c}
                                className={`border px-3 py-1 min-w-[160px] max-w-[360px] align-top ${
                                  editingNow
                                    ? "outline outline-2 outline-emerald-500"
                                    : ""
                                }`}
                                onDoubleClick={() => startEdit(r, c)}
                              >
                                {editingNow ? (
                                  <input
                                    autoFocus
                                    className="w-full bg-white outline-none"
                                    defaultValue={String(value)}
                                    onBlur={(e) => {
                                      setCellValue(r, c, e.target.value);
                                      stopEdit();
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        setCellValue(r, c, e.currentTarget.value);
                                        stopEdit();
                                      }
                                      if (e.key === "Escape") {
                                        e.preventDefault();
                                        stopEdit();
                                      }
                                    }}
                                  />
                                ) : (
                                  <div className="whitespace-nowrap overflow-hidden text-ellipsis">
                                    {String(value)}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Padding bawah */}
                {bottomPad > 0 && <div style={{ height: bottomPad }} />}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
