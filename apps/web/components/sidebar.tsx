"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  ["Dashboard", "/dashboard"],
  ["Signals", "/live-signals"],
  ["Personal", "/personal"],
  ["Prop", "/prop"],
  ["Runtime", "/runtime"],
  ["Strategies", "/strategies"],
  ["Risk", "/risk"],
  ["Telegram", "/telegram"],
  ["Analytics", "/analytics"],
  ["Settings", "/settings"]
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-full border-b border-slate-800 bg-slate-900/60 px-3 py-3 md:w-64 md:border-b-0 md:border-r md:px-4 md:py-4">
      <h1 className="mb-3 text-lg font-semibold tracking-tight text-slate-100 md:mb-6 md:text-xl">hashi-bot2</h1>
      <nav className="grid grid-cols-2 gap-1 md:grid-cols-1 md:space-y-1">
        {navItems.map(([label, href]) => {
          const active = pathname === href || (href !== "/dashboard" && pathname?.startsWith(`${href}/`));
          return (
          <Link
            key={href}
            href={href}
            className={[
              "block rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-emerald-600/20 text-emerald-200 ring-1 ring-emerald-400/60"
                : "text-slate-300 hover:bg-slate-800/90 hover:text-slate-100"
            ].join(" ")}
            aria-current={active ? "page" : undefined}
          >
            {label}
          </Link>
        );
        })}
      </nav>
      <div className="mt-4 border-t border-slate-800 pt-3">
        <Link
          href="/logout"
          className="block rounded-md px-3 py-2 text-sm text-rose-200 transition-colors hover:bg-rose-900/30 hover:text-rose-100"
        >
          Logout
        </Link>
      </div>
    </aside>
  );
}
