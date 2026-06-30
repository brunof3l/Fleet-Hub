"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";

import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Inicio" },
  { href: "/apresentacao", label: "Apresentacao" },
  { href: "/frota", label: "Frota" },
  { href: "/combustivel", label: "Combustivel" },
  { href: "/conferencia", label: "Conferencia" },
  { href: "/velocidade", label: "Velocidade" },
];

type CurrentUser = {
  nome: string;
  email: string;
  role: "admin" | "user";
};

export function ModuleNav() {
  const pathname = usePathname();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (active && payload?.user) {
          setUser(payload.user as CurrentUser);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const navLinks = user?.role === "admin" ? [...links, { href: "/admin", label: "Admin" }] : links;

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore — redirect anyway
    }
    window.location.assign("/login");
  }

  return (
    <nav className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-slate-950/60 p-4 shadow-xl shadow-black/20 backdrop-blur-sm lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-emerald-300">Fleet Hub</p>
        <h2 className="mt-1 text-lg font-semibold text-white">Frota, Combustivel e Velocidade</h2>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {navLinks.map((link) => {
          const isActive =
            pathname === link.href || (link.href !== "/" && pathname?.startsWith(link.href));

          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-2xl border px-4 py-2 text-sm font-medium transition",
                isActive
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                  : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]",
              )}
            >
              {link.label}
            </Link>
          );
        })}

        {user ? (
          <div className="ml-1 flex items-center gap-2 border-l border-white/10 pl-3">
            <span className="hidden text-sm text-slate-400 sm:inline" title={user.email}>
              {user.nome}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="inline-flex items-center gap-1 rounded-2xl border border-rose-500/30 px-3 py-2 text-sm font-medium text-rose-200 transition hover:bg-rose-500/10 disabled:opacity-50"
            >
              <LogOut className="size-4" />
              Sair
            </button>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
