// components/ExcelEditorModal.tsx
"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";

type Aoa = (string | number)[][];
type SheetState = {
  name: string;
  data: Aoa;
};

export default function ExcelEditorModal({
  open,
  fileUrl,
  onClose,
}: {
  open: boolean;
  fileUrl: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [sheets, setSheets] = useState<SheetState[]>([]);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open || !fileUrl) return;

    let cancelled = false;

    const loadExcel = async () => {
      try {
        setLoading(true);
        setMessage("");
        setSheets([]);

        const res = await fetch("/api/asakai-read-excel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filePath: fileUrl }),
        });

        if (!res.ok) {
          throw new Error("Gagal membaca file di server");
        }

        const buffer = await res.arrayBuffer();
        if (cancelled) return;

        const wb = XLSX.read(buffer, { type: "array" });

        const loadedSheets: SheetState[] = wb.SheetNames.map((name) => {
          const ws = wb.Sheets[name];
          const aoa = XLSX.utils.sheet_to_json(ws, {
            header: 1,
            blankrows: false,
          }) as Aoa;
          return { name, data: aoa };
        });

        setSheets(loadedSheets);
        setActiveSheetIndex(0);
      } catch (err) {
        console.error(err);
        setMessage("❌ Gagal memuat Excel");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadExcel();

    return () => {
      cancelled = true;
    };
  }, [open, fileUrl]);

  const saveToServer = async () => {
    try {
      setMessage("");

      const wb = XLSX.utils.book_new();

      sheets.forEach((sheet) => {
        const ws = XLSX.utils.aoa_to_sheet(sheet.data);
        XLSX.utils.book_append_sheet(wb, ws, sheet.name || "Sheet");
      });

      const excelBuffer = XLSX.write(wb, {
        type: "array",
        bookType: "xlsx",
      });

      const blob = new Blob([excelBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const formData = new FormData();
      formData.append("file", blob, "updated.xlsx");
      formData.append("path", fileUrl);

      const res = await fetch("/api/asakai-save-excel", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Gagal upload");

      setMessage("✔ Data berhasil disimpan di aplikasi");
      onClose();
    } catch (err) {
      console.error(err);
      alert("Gagal menyimpan data ke server.");
    }
  };

  const handleCellChange = (
    sheetIndex: number,
    rowIndex: number,
    colIndex: number,
    value: string
  ) => {
    setSheets((prev) => {
      const newSheets = [...prev];
      const sheet = { ...newSheets[sheetIndex] };
      const dataCopy = sheet.data.map((row) => [...row]);

      if (!dataCopy[rowIndex]) {
        dataCopy[rowIndex] = [];
      }
      dataCopy[rowIndex][colIndex] = value;

      sheet.data = dataCopy;
      newSheets[sheetIndex] = sheet;
      return newSheets;
    });
  };

  if (!open) return null;

  const activeSheet = sheets[activeSheetIndex];
  const data = activeSheet?.data ?? [];
  const headers = data[0] || [];
  const bodyRows = data.slice(1);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-xl shadow-xl w-[96%] max-w-[1400px] h-[92vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold">Edit Excel</h3>

          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-red-100 text-red-600 hover:bg-red-200 text-sm"
          >
            Tutup
          </button>
        </div>

        {/* Sheet tabs */}
        <div className="px-4 pt-3 border-b bg-slate-50">
          {sheets.length === 0 ? (
            <span className="text-xs text-slate-500">
              {loading ? "Memuat sheet…" : "Tidak ada sheet."}
            </span>
          ) : (
            <div className="flex gap-2 overflow-x-auto">
              {sheets.map((s, idx) => (
                <button
                  key={s.name + idx}
                  onClick={() => setActiveSheetIndex(idx)}
                  className={`px-3 py-1 rounded-t-md text-xs border-b-0 ${
                    idx === activeSheetIndex
                      ? "bg-white border border-slate-300 border-b-white font-semibold"
                      : "bg-slate-100 border border-transparent text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {s.name || `Sheet ${idx + 1}`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden p-4">
          {loading && <p>Memuat data…</p>}

          {!loading && data.length === 0 && (
            <p className="text-gray-500 text-sm">
              Tidak ada data pada sheet ini.
            </p>
          )}

          {!loading && data.length > 0 && (
            <div className="border rounded h-full overflow-auto">
              <table className="text-xs min-w-full">
                <thead>
                  <tr>
                    {headers.map((h, idx) => (
                      <th
                        key={idx}
                        className="border px-2 py-1 bg-gray-100 sticky top-0 z-10 whitespace-nowrap"
                      >
                        {h ?? ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bodyRows.map((row, ri) => {
                    const realRowIndex = ri + 1; // karena baris 0 = header
                    return (
                      <tr key={realRowIndex}>
                        {headers.map((_, ci) => (
                          <td key={ci} className="border p-0">
                            <input
                              className="w-full px-1 py-0.5 text-xs outline-none"
                              value={
                                row[ci] !== undefined && row[ci] !== null
                                  ? String(row[ci])
                                  : ""
                              }
                              onChange={(e) =>
                                handleCellChange(
                                  activeSheetIndex,
                                  realRowIndex,
                                  ci,
                                  e.target.value
                                )
                              }
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t flex gap-3 justify-end">
          <button
            onClick={saveToServer}
            className="px-5 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 text-sm"
          >
            Simpan
          </button>
        </div>

        {message && (
          <div className="px-4 py-2 text-center text-xs text-green-600">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
