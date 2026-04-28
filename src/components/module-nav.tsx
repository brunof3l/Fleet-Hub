"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Inicio" },
  { href: "/combustivel", label: "Combustivel" },
  { href: "/velocidade", label: "Velocidade" },
];

export function ModuleNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-slate-950/60 p-4 shadow-xl shadow-black/20 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-emerald-300">Fleet Hub</p>
        <h2 className="mt-1 text-lg font-semibold text-white">Combustivel e Velocidade</h2>
      </div>

      <div className="flex flex-wrap gap-2">
        {links.map((link) => {
          const isActive =
            pathname === link.href ||
            (link.href !== "/" && pathname?.startsWith(link.href));

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
      </div>
    </nav>
  );
}
