export default function DashboardPage() {
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded border border-slate-800 bg-slate-900 p-4">
          <h2 className="text-sm text-slate-400">App Status</h2>
          <p className="text-lg font-semibold">Operational (mock)</p>
        </div>
        <div className="rounded border border-slate-800 bg-slate-900 p-4">
          <h2 className="text-sm text-slate-400">DB Connected</h2>
          <p className="text-lg font-semibold">Yes (mock)</p>
        </div>
        <div className="rounded border border-slate-800 bg-slate-900 p-4">
          <h2 className="text-sm text-slate-400">Worker Running</h2>
          <p className="text-lg font-semibold">Yes (mock)</p>
        </div>
      </div>
    </section>
  );
}
