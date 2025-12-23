"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";

/** ---------------------------
 *  Palet & Data Menu
 *  --------------------------*/
const GREEN = {
  base: "#0E7B4A",
  soft: "#DFF1E9",
  sage: "#6C8B7B",
  ring: "#B9D7C8",
};

const MENU = [
  { href: "/", label: "Dashboard", icon: "grid" as const, badge: "" },
  { href: "/downtime", label: "Downtime", icon: "clock" as const, badge: "" },
  { href: "/input", label: "Input User", icon: "calendar" as const, badge: "" },
];

// ❗ tetap ada, tapi kita render logout sebagai BUTTON (bukan Link)
const GENERAL = [{ href: "/logout", label: "Logout", icon: "logout" as const }];

/** ---------------------------
 *  Ikon inline
 *  --------------------------*/
function Icon({ name, active = false }: { name: string; active?: boolean }) {
  const stroke = active ? GREEN.base : "#7B8D87";

  switch (name) {
    case "grid":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" stroke={stroke} fill="none" strokeWidth="1.8">
          <rect x="3" y="3" width="8" height="8" rx="2" />
          <rect x="13" y="3" width="8" height="8" rx="2" />
          <rect x="3" y="13" width="8" height="8" rx="2" />
          <rect x="13" y="13" width="8" height="8" rx="2" />
        </svg>
      );
    case "clock":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" stroke={stroke} fill="none" strokeWidth="1.8">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6l4 2" />
        </svg>
      );
    case "calendar":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" stroke={stroke} fill="none" strokeWidth="1.8">
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M16 2v4M8 2v4M3 9h18" />
        </svg>
      );
    case "logout":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" stroke={stroke} fill="none" strokeWidth="1.8">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="M16 17l5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
      );
    default:
      return null;
  }
}

/** clock */
function Clock() {
  const [now, setNow] = useState("");

  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleString("id-ID", {
          weekday: "long",
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="text-[11px] sm:text-xs px-3 py-1 rounded-lg font-medium text-neutral-700"
      style={{ background: "#EEF5F1", boxShadow: `0 0 0 1px ${GREEN.ring} inset` }}
    >
      {now}
    </div>
  );
}

/** ---------------------------
 *  Shell layout (Topbar + Sidebar + Content)
 *  --------------------------*/
export default function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // ✅ FIX HYDRATION:
  // Jangan baca localStorage di initializer (SSR vs Client bisa beda)
  // Defaultkan dulu true, lalu sync dari localStorage setelah mount.
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true; // SSR safe
    const saved = localStorage.getItem("sidebar-open");
    return saved === null ? true : saved === "1";
  });

  // ✅ NEW: role state (untuk hide menu)
  const [role, setRole] = useState<"admin" | "user" | "">("");

  const pathname = usePathname();

  // ✅ NEW: baca cookie role di client
  useEffect(() => {
    const m = document.cookie.match(/(?:^|;\s*)asakai_role=([^;]+)/);
    const v = m ? decodeURIComponent(m[1]) : "";
    setRole(v === "admin" || v === "user" ? v : "");
  }, []);

  // ✅ hanya simpan perubahan
  useEffect(() => {
    try {
      localStorage.setItem("sidebar-open", open ? "1" : "0");
    } catch {
      // ignore
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ringStyle = { boxShadow: `0 0 0 1px ${GREEN.ring} inset` };

  const linkClass = (href: string) => {
    const active = pathname === href;
    return [
      "group flex items-center gap-3 rounded-xl transition-colors",
      open ? "px-3 py-2.5" : "px-3 py-2.5 justify-center",
      active ? "bg-white text-neutral-900 shadow-sm ring-1" : "text-[#70877E] hover:bg-white hover:text-neutral-900",
    ].join(" ");
  };

  // ✅ NEW: menu yang ditampilkan (user hanya lihat /input)
  const visibleMenu = role === "user" ? MENU.filter((m) => m.href === "/input") : MENU;

  // ✅ LOGOUT MODAL (baru - hanya ini yang ditambah)
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const handleLogoutConfirm = async () => {
    setLogoutLoading(true);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });

      // fallback kalau backend kamu logout via GET redirect
      if (!res.ok) {
        window.location.href = "/api/auth/logout";
        return;
      }

      router.replace("/login");
      router.refresh();
    } catch {
      // fallback kalau network error
      window.location.href = "/api/auth/logout";
    } finally {
      setLogoutLoading(false);
      setLogoutOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7F6] text-neutral-900">
      {/* Topbar */}
      <header className="fixed top-0 left-0 right-0 z-40 h-14 bg-white/90 backdrop-blur border-b border-[#E5ECE8] flex items-center justify-between px-3 sm:px-5">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle sidebar"
            className="inline-flex items-center justify-center h-10 w-10 rounded-lg hover:bg-[#EAF3EE] active:scale-[0.98]"
            style={ringStyle}
            type="button"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={GREEN.base} strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div
            className="hidden sm:block text-sm font-semibold px-3 py-1 rounded-lg"
            style={{ background: GREEN.soft, color: GREEN.base }}
          >
            Dashboard of Production Performance
          </div>

          <div
            className="hidden sm:block text-sm font-semibold px-3 py-1 rounded-lg"
            style={{ background: GREEN.soft, color: GREEN.base }}
          >
            <span className="text-red-600 font-bold">PT Indonesia Koito</span>
          </div>
        </div>

        <Clock />
      </header>

      {/* Sidebar */}
      <aside
        className={[
          "fixed top-14 left-0 bottom-0 z-30 bg-[#F9FBFA] border-r border-[#E5ECE8]",
          "transition-all duration-300 ease-in-out",
          open ? "sm:w-72" : "sm:w-20",
          open ? "translate-x-0" : "-translate-x-full sm:translate-x-0",
          "w-64",
        ].join(" ")}
      >
        <div className="h-full overflow-hidden">
          <div className="px-4 pt-5 pb-4 text-[11px] tracking-wider font-semibold text-[#8AA197]">{open ? "MENU" : ""}</div>

          <nav className="px-3 space-y-1">
            {visibleMenu.map((m) => {
              const active = pathname === m.href;
              return (
                <Link
                  key={m.href}
                  href={m.href}
                  className={linkClass(m.href)}
                  style={active ? ringStyle : undefined}
                  title={!open ? m.label : undefined}
                >
                  <Icon name={m.icon} active={active} />
                  {open && <span className={`flex-1 ${active ? "font-semibold" : "font-medium"}`}>{m.label}</span>}
                </Link>
              );
            })}
          </nav>

          <div className="px-4 pt-7 pb-3 text-[11px] tracking-wider font-semibold text-[#8AA197]">{open ? "GENERAL" : ""}</div>

          <nav className="px-3 space-y-1 pb-4">
            {GENERAL.map((g) => {
              // ✅ khusus logout: pakai button + modal confirm
              if (g.href === "/logout") {
                const active = pathname === g.href;
                return (
                  <button
                    key={g.href}
                    onClick={() => setLogoutOpen(true)}
                    className={linkClass(g.href)}
                    style={active ? ringStyle : undefined}
                    title={!open ? g.label : undefined}
                    type="button"
                  >
                    <Icon name={g.icon} active={active} />
                    {open && <span className="flex-1 font-medium">{g.label}</span>}
                  </button>
                );
              }

              // default: tetap link untuk item general lain (kalau nanti ditambah)
              const active = pathname === g.href;
              return (
                <Link
                  key={g.href}
                  href={g.href}
                  className={linkClass(g.href)}
                  style={active ? ringStyle : undefined}
                  title={!open ? g.label : undefined}
                >
                  <Icon name={g.icon} active={active} />
                  {open && <span className={`flex-1 ${active ? "font-semibold" : "font-medium"}`}>{g.label}</span>}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 top-14 bg-black/20 backdrop-blur-[1px] z-20 sm:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Content */}
      <main className={["pt-14 transition-all duration-300", open ? "sm:pl-72" : "sm:pl-20"].join(" ")}>
        <div className="p-4 sm:p-6">{children}</div>
      </main>

      {/* ✅ CONFIRM LOGOUT (baru - hanya ini yang ditambah) */}
      <ConfirmDialog
        open={logoutOpen}
        title="LOGOUT"
        message="Yakin ingin logout?"
        cancelText="Batal"
        confirmText="Ya, Logout"
        loading={logoutLoading}
        onCancel={() => setLogoutOpen(false)}
        onConfirm={handleLogoutConfirm}
      />
    </div>
  );
}
