"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

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
  {
    href: "/input",
    label: "Input User",
    icon: "calendar" as const,
    badge: "",
  },
  // {
  //   href: "/abnormal/list",
  //   label: "Abnormal Issue",
  //   icon: "alert" as const,
  //   badge: "",
  // },
];

const GENERAL = [{ href: "/logout", label: "Logout", icon: "logout" as const }];

/** ---------------------------
 *  Ikon inline
 *  --------------------------*/
function Icon({ name, active = false }: { name: string; active?: boolean }) {
  const stroke = active ? GREEN.base : "#7B8D87";
  const fill = active ? GREEN.base : "none";

  switch (name) {
    case "grid":
      return (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          stroke={stroke}
          fill="none"
          strokeWidth="1.8"
        >
          <rect x="3" y="3" width="8" height="8" rx="2" />
          <rect x="13" y="3" width="8" height="8" rx="2" />
          <rect x="3" y="13" width="8" height="8" rx="2" />
          <rect x="13" y="13" width="8" height="8" rx="2" />
        </svg>
      );
    case "alert":
      return (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          stroke={stroke}
          fill="none"
          strokeWidth="1.8"
        >
          <path d="M12 9v4" />
          <circle cx="12" cy="17" r="1" fill={stroke} />
          <path d="M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.29 2.25h17.78A1.5 1.5 0 0 0 22.18 18L13.71 3.86a1.5 1.5 0 0 0-2.42 0z" />
        </svg>
      );
    case "docs":
      return (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          stroke={stroke}
          fill="none"
          strokeWidth="1.8"
        >
          <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
          <path d="M14 3v5h5" />
        </svg>
      );
    case "calendar":
      return (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          stroke={stroke}
          fill="none"
          strokeWidth="1.8"
        >
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M16 2v4M8 2v4M3 9h18" />
        </svg>
      );
    case "chart":
      return (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          stroke={stroke}
          fill="none"
          strokeWidth="1.8"
        >
          <path d="M3 20h18" />
          <rect x="5" y="10" width="3" height="7" rx="1" />
          <rect x="10.5" y="7" width="3" height="10" rx="1" />
          <rect x="16" y="4" width="3" height="13" rx="1" />
        </svg>
      );
    case "team":
      return (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          stroke={stroke}
          fill="none"
          strokeWidth="1.8"
        >
          <circle cx="8" cy="7" r="3" />
          <path d="M3 20v-1a5 5 0 0 1 5-5" />
          <circle cx="17" cy="9" r="3" />
          <path d="M22 20v-1a5 5 0 0 0-5-5" />
        </svg>
      );
    case "gear":
      return (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          stroke={stroke}
          fill="none"
          strokeWidth="1.8"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.07a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.07a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.02 2.3l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V1a2 2 0 1 1 4 0v.07a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c0 .66.39 1.26 1 1.51.32.13.67.2 1.02.2H23a2 2 0 1 1 0 4h-.07a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    case "help":
      return (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          stroke={stroke}
          fill="none"
          strokeWidth="1.8"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9A3 3 0 1 1 12 15v1" />
          <circle cx="12" cy="19" r="1" fill={stroke} />
        </svg>
      );
    case "logout":
      return (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          stroke={stroke}
          fill="none"
          strokeWidth="1.8"
        >
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
      style={{
        background: "#EEF5F1",
        boxShadow: `0 0 0 1px ${GREEN.ring} inset`,
      }}
    >
      {now}
    </div>
  );
}

/** ---------------------------
 *  Shell layout (Topbar + Sidebar + Content)
 *  --------------------------*/
export default function Shell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    const saved =
      typeof window !== "undefined"
        ? localStorage.getItem("sidebar-open")
        : null;
    if (saved !== null) setOpen(saved === "1");
  }, []);

  useEffect(() => {
    localStorage.setItem("sidebar-open", open ? "1" : "0");
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

  const linkClass = (href: string) => {
    const active = pathname === href;
    return [
      "group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
      active
        ? "bg-white text-neutral-900 shadow-sm ring-1"
        : "text-[#70877E] hover:bg-white hover:text-neutral-900",
    ].join(" ");
  };

  const ringStyle = { boxShadow: `0 0 0 1px ${GREEN.ring} inset` };

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
          >
            <svg
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              stroke={GREEN.base}
              strokeWidth="2"
            >
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
          "transition-transform duration-300 ease-in-out transform",
          open ? "translate-x-0" : "-translate-x-full",
          "w-64 sm:w-72 sm:translate-x-0", // desktop selalu terlihat
        ].join(" ")}
        aria-hidden={!open}
      >
        <div className="h-full overflow-hidden">
          <div className="px-4 pt-5 pb-4 text-[11px] tracking-wider font-semibold text-[#8AA197]">
            MENU
          </div>
          <nav className="px-3 space-y-1">
            {MENU.map((m) => {
              const active = pathname === m.href;
              return (
                <Link
                  key={m.href}
                  href={m.href}
                  className={linkClass(m.href)}
                  style={active ? ringStyle : undefined}
                >
                  <Icon name={m.icon} active={active} />
                  <span
                    className={`flex-1 ${
                      active ? "font-semibold" : "font-medium"
                    }`}
                  >
                    {m.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="px-4 pt-7 pb-3 text-[11px] tracking-wider font-semibold text-[#8AA197]">
            GENERAL
          </div>
          <nav className="px-3 space-y-1 pb-4">
            {GENERAL.map((g) => {
              const active = pathname === g.href;
              return (
                <Link
                  key={g.href}
                  href={g.href}
                  className={linkClass(g.href)}
                  style={active ? ringStyle : undefined}
                >
                  <Icon name={g.icon} active={active} />
                  <span
                    className={`flex-1 ${
                      active ? "font-semibold" : "font-medium"
                    }`}
                  >
                    {g.label}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Mobile overlay (hanya di bawah sm) */}
      {open && (
        <div
          className="fixed inset-0 top-14 bg-black/20 backdrop-blur-[1px] z-20 sm:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Content */}
      <main className="pt-14 transition-all duration-300 sm:pl-72">
        <div className="p-4 sm:p-6">{children}</div>
      </main>
    </div>
  );
}
