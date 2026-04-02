import Link from "next/link";

const navItems = [
  ["Dashboard", "/dashboard"],
  ["Backtests", "/backtests"],
  ["Replay", "/replay"],
  ["Live Signals", "/live-signals"],
  ["Strategies", "/strategies"],
  ["Risk", "/risk"],
  ["Telegram", "/telegram"],
  ["Analytics", "/analytics"],
  ["Settings", "/settings"]
];

export function Sidebar() {
  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-900/50 p-4">
      <h1 className="mb-6 text-xl font-semibold">hashi-bot2</h1>
      <nav className="space-y-1">
        {navItems.map(([label, href]) => (
          <Link
            key={href}
            href={href}
            className="block rounded px-3 py-2 text-slate-200 hover:bg-slate-800"
          >
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
