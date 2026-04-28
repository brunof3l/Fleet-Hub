"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const links = [
  { href: "/combustivel", label: "Painel" },
  { href: "/combustivel/auditoria", label: "Auditoria" },
];

export function CombustivelNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2 rounded-3xl border border-white/10 bg-slate-950/60 p-3 shadow-xl shadow-black/20 backdrop-blur-sm">
      {links.map((link) => {
        const isActive = pathname === link.href;

        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-2xl border px-4 py-2 text-sm font-medium transition",
              isActive
                ? "border-sky-400/40 bg-sky-400/10 text-sky-200"
                : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
