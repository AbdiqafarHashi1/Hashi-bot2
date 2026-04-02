export default function Page() {
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-bold">Live Signals</h1>
      <p className="text-slate-300">Engine wiring placeholder (no dispatch loop in Phase 2).</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded border border-slate-800 bg-slate-900 p-4">
          <h2 className="font-semibold">Primary Provider</h2>
          <p className="text-slate-300">Binance spot (placeholder)</p>
        </div>
        <div className="rounded border border-slate-800 bg-slate-900 p-4">
          <h2 className="font-semibold">Backup Provider</h2>
          <p className="text-slate-300">Bybit spot (placeholder)</p>
        </div>
      </div>
    </section>
  );
}
