"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const GREEN = {
  base: "#0E7B4A",
  soft: "#DFF1E9",
  ring: "#B9D7C8",
  dark: "#065F3A",
  gradient: "linear-gradient(135deg, #0E7B4A 0%, #0A5C38 100%)",
};

export default function Page() {
  const router = useRouter();
  const sp = useSearchParams();

  const nextUrl = useMemo(() => sp.get("next") || "/", [sp]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password, remember }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json?.message || "Login gagal.");
        setLoading(false);
        return;
      }

      router.replace(nextUrl);
      router.refresh();
    } catch {
      setError("Error jaringan.");
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50">
      {/* ===== DECORATIVE ELEMENTS ===== */}
      <div
        className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-20 blur-3xl"
        style={{ background: GREEN.base }}
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-15 blur-3xl"
        style={{ background: GREEN.base }}
        aria-hidden="true"
      />

      {/* ===== SUBTLE PATTERN OVERLAY ===== */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `radial-gradient(${GREEN.base} 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }}
        aria-hidden="true"
      />

      {/* ===== CONTENT ===== */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* ===== LOGO / BRAND SECTION ===== */}
          <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-lg"
            style={{ background: GREEN.gradient }}
          >
            <img
              src="/logo.png"
              alt="KOITO Logo"
              className="w-10 h-10 object-contain"
            />
          </div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
              DASHBOARD PRODUCTION
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Selamat datang kembali
            </p>
          </div>

          {/* ===== CARD ===== */}
          <div className="bg-white/80 backdrop-blur-xl border border-white/50 rounded-[28px] p-8 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.1)]">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-slate-800">Masuk ke Akun</h2>
              <p className="text-sm text-slate-500 mt-1">
                Silakan masukkan kredensial Anda
              </p>
            </div>

            {/* ===== ERROR MESSAGE ===== */}
            {error && (
              <div className="mb-5 flex items-center gap-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-2xl p-4 animate-in slide-in-from-top-2 duration-200">
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-red-100 flex items-center justify-center">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                {error}
              </div>
            )}

            <form onSubmit={onSubmit} className="space-y-5">
              {/* ===== USERNAME FIELD ===== */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-slate-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                  Username
                </label>
                <input
                  className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-4 py-3.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-all duration-200 focus:border-emerald-200 focus:bg-white focus:ring-4 focus:ring-emerald-50"
                  placeholder="Masukkan username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>

              {/* ===== PASSWORD FIELD ===== */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-slate-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                  Password
                </label>

                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50/50 px-4 py-3.5 pr-20 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-all duration-200 focus:border-emerald-200 focus:bg-white focus:ring-4 focus:ring-emerald-50"
                    placeholder="Masukkan password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all duration-200 hover:bg-slate-100"
                    style={{ color: GREEN.base }}
                  >
                    {showPw ? (
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                        Hide
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        Show
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* ===== REMEMBER ME ===== */}
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div
                    className="w-5 h-5 rounded-lg border-2 border-slate-200 transition-all duration-200 peer-checked:border-transparent flex items-center justify-center"
                    style={{
                      background: remember ? GREEN.base : "transparent",
                    }}
                  >
                    {remember && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-sm text-slate-600 group-hover:text-slate-800 transition-colors">
                  Ingat saya di perangkat ini
                </span>
              </label>

              {/* ===== SUBMIT BUTTON ===== */}
              <button
                disabled={loading}
                className="w-full rounded-2xl text-white font-bold py-4 text-sm transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-emerald-200 active:scale-[0.98] flex items-center justify-center gap-2"
                style={{ background: GREEN.gradient }}
                type="submit"
              >
                {loading ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Memproses...
                  </>
                ) : (
                  <>
                    Masuk
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* ===== FOOTER ===== */}
          <div className="text-center mt-6 space-y-2">
            <p className="text-xs text-slate-400">
              Dengan masuk, Anda menyetujui{" "}
              <a href="#" className="underline hover:text-slate-600 transition-colors">
                Syarat & Ketentuan
              </a>
            </p>
            <p className="text-xs text-slate-400">
              © {new Date().getFullYear()} DASHBOARD PRODUCTION. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}