"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navItems = [
  ["Dashboard", "/dashboard"],
  ["Signals", "/live-signals"],
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
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800 bg-slate-950 px-3 py-2 md:hidden">
        <h1 className="text-base font-semibold text-slate-100">hashi-bot2</h1>
        <button className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-200" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "Menu"}
        </button>
      </div>
      <aside className="hidden min-w-0 border-r border-slate-800 bg-slate-900/60 px-4 py-4 md:block md:w-64">
        <h1 className="mb-6 text-xl font-semibold tracking-tight text-slate-100">hashi-bot2</h1>
        <Nav pathname={pathname} onNav={() => undefined} />
      </aside>
      {open ? (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setOpen(false)}>
          <aside className="h-full w-[82vw] max-w-xs overflow-y-auto border-r border-slate-800 bg-slate-900 p-3" onClick={(e) => e.stopPropagation()}>
            <Nav pathname={pathname} onNav={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}
    </>
  );
}

function Nav({ pathname, onNav }: { pathname: string | null; onNav: () => void }) {
  return <>
    <nav className="grid grid-cols-1 gap-1">
      {navItems.map(([label, href]) => {
        const active = pathname === href || (href !== "/dashboard" && pathname?.startsWith(`${href}/`));
        return <Link key={href} href={href} onClick={onNav} className={[
          "block rounded-md px-3 py-2 text-sm transition-colors",
          active ? "bg-emerald-600/20 text-emerald-200 ring-1 ring-emerald-400/60" : "text-slate-300 hover:bg-slate-800/90 hover:text-slate-100"
        ].join(" ")}>{label}</Link>;
      })}
    </nav>
    <div className="mt-4 border-t border-slate-800 pt-3">
      <Link href="/logout" onClick={onNav} className="block rounded-md px-3 py-2 text-sm text-rose-200 transition-colors hover:bg-rose-900/30 hover:text-rose-100">Logout</Link>
    </div>
  </>;
}
