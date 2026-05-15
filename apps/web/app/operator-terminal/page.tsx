async function getData() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/operator-terminal`, { cache: 'no-store' });
  if (!res.ok) {
    if (res.status === 401) return { _error: "unauthorized" };
    if (res.status === 503) return { _error: "dashboard_auth_not_configured" };
    return { _error: `api_unreachable_${res.status}` };
  }
  return res.json();
}

export default async function OperatorTerminalPage() {
  const data = await getData();
  const modeRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/modes/readiness`, { cache: 'no-store' });
  const modeData = modeRes.ok ? await modeRes.json() : { matrix: [] };
  if (data?._error) {
    return <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Operator Terminal</h1>
      <p className="rounded border border-rose-600 bg-rose-950/30 p-3 text-sm">
        Auth/API status: <b>{data._error}</b>
      </p>
    </main>;
  }
  const audit = data?.recentAudit ?? [];
  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Operator Terminal</h1>
      <p className="text-sm text-slate-400">Live control/lifecycle snapshot + recent control audit commands.</p>
      <pre className="rounded bg-slate-900 p-3 text-xs overflow-auto">{JSON.stringify(data?.control ?? {}, null, 2)}</pre>
      <pre className="rounded bg-slate-900 p-3 text-xs overflow-auto">{JSON.stringify(data?.lifecycle ?? {}, null, 2)}</pre>
      <section>
        <h2 className="text-lg font-medium mb-2">Recent control audit</h2>
        <ul className="space-y-2 text-sm">
          {audit.map((item: any) => (
            <li key={item.id} className="rounded border border-slate-700 p-2">
              <div>{item.action} · {item.actor}</div>
              <div className="text-slate-400">{item.createdAt}</div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-lg font-medium mb-2">Mode readiness panel</h2>
        <ul className="space-y-2 text-sm">
          {(modeData.matrix ?? []).map((row: any) => (
            <li key={row.modeId} className="rounded border border-slate-700 p-2">
              <div>{row.modeId} · <b>{row.status}</b></div>
              <div className="text-slate-400">blockers: {(row.blockers ?? []).join(", ") || "none"}</div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
