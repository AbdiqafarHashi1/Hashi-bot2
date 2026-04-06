"use client";

import { useEffect, useState } from "react";

type PropConnectorStatus = {
  id: string;
  connector: string;
  status: string;
  authPresent: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  mode: string;
};

type PropAccountSnapshot = {
  id: string;
  connector: string;
  equity: number | null;
  balance: number | null;
  availableMargin: number | null;
  usedMargin: number | null;
  unrealizedPnl: number | null;
  realizedPnl: number | null;
  dailyLossPct: number | null;
  trailingDrawdownPct: number | null;
  openRiskPct: number | null;
  capturedAt: string;
};

type PropPosition = {
  id: string;
  symbol: string;
  side: string;
  size: number | null;
  entryPrice: number | null;
  markPrice: number | null;
  unrealizedPnl: number | null;
  realizedPnl: number | null;
  drawdownImpact: number | null;
  status: string;
  openedAt: string | null;
  closedAt: string | null;
};

type PropComplianceEvent = {
  id: string;
  eventType: string;
  lockType: string | null;
  reason: string | null;
  severity: string | null;
  occurredAt: string;
};

type PropRuntimeEvent = {
  id: string;
  eventType: string;
  connector: string | null;
  symbol: string | null;
  occurredAt: string;
};

type PropRoomPayload = {
  connectorStatus: PropConnectorStatus | null;
  latestAccountSnapshot: PropAccountSnapshot | null;
  openPositions: PropPosition[];
  closedPositions: PropPosition[];
  complianceEvents: PropComplianceEvent[];
  recentEvents: PropRuntimeEvent[];
};

function NumberValue({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-400">-</span>;
  return <span>{value.toFixed(6)}</span>;
}

export default function PropPage() {
  const [data, setData] = useState<PropRoomPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    fetch("/api/prop-room")
      .then(async (res) => {
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message ?? `Request failed (${res.status})`);
        }
        return res.json() as Promise<PropRoomPayload>;
      })
      .then((payload) => {
        if (!mounted) return;
        setData(payload);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setData(null);
        setError(err instanceof Error ? err.message : "Unable to load prop room data");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-3xl font-bold">Prop Room</h1>
        <p className="mt-1 text-sm text-slate-400">Persisted prop connector/account foundation with compliance-first visibility. This page does not represent live funded execution control.</p>
      </header>

      {loading && <p className="rounded border border-slate-800 bg-slate-900/70 p-3 text-sm text-slate-300">Loading prop room…</p>}
      {error && <p className="rounded border border-rose-700/50 bg-rose-900/20 p-3 text-sm text-rose-200">{error}</p>}

      {data && (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded border border-slate-800 bg-slate-900/70 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Open positions</p>
              <p className="mt-2 text-2xl font-semibold text-slate-100">{data.openPositions.length}</p>
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/70 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Closed positions</p>
              <p className="mt-2 text-2xl font-semibold text-slate-100">{data.closedPositions.length}</p>
            </div>
            <div className="rounded border border-amber-700/40 bg-amber-900/20 p-4">
              <p className="text-xs uppercase tracking-wide text-amber-300">Compliance events</p>
              <p className="mt-2 text-2xl font-semibold text-amber-100">{data.complianceEvents.length}</p>
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/70 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Runtime events</p>
              <p className="mt-2 text-2xl font-semibold text-slate-100">{data.recentEvents.length}</p>
            </div>
          </div>

          <section className="rounded border border-slate-800 bg-slate-900/70 p-4">
            <h2 className="mb-3 text-lg font-semibold">Connector Status</h2>
            {data.connectorStatus ? (
              <dl className="grid gap-2 text-sm md:grid-cols-2">
                <div><dt className="text-slate-400">Connector</dt><dd>{data.connectorStatus.connector}</dd></div>
                <div><dt className="text-slate-400">Status</dt><dd>{data.connectorStatus.status}</dd></div>
                <div><dt className="text-slate-400">Auth present</dt><dd>{data.connectorStatus.authPresent ? "yes" : "no"}</dd></div>
                <div><dt className="text-slate-400">Last sync</dt><dd>{data.connectorStatus.lastSyncAt ? new Date(data.connectorStatus.lastSyncAt).toISOString() : "-"}</dd></div>
                <div className="md:col-span-2"><dt className="text-slate-400">Last error</dt><dd>{data.connectorStatus.lastError ?? "-"}</dd></div>
              </dl>
            ) : (
              <p className="text-sm text-slate-400">No prop connector status yet.</p>
            )}
          </section>

          <section className="rounded border border-slate-800 bg-slate-900/70 p-4">
            <h2 className="mb-3 text-lg font-semibold">Account Snapshot</h2>
            {data.latestAccountSnapshot ? (
              <dl className="grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-3">
                <div><dt className="text-slate-400">Balance</dt><dd><NumberValue value={data.latestAccountSnapshot.balance} /></dd></div>
                <div><dt className="text-slate-400">Equity</dt><dd><NumberValue value={data.latestAccountSnapshot.equity} /></dd></div>
                <div><dt className="text-slate-400">Available margin</dt><dd><NumberValue value={data.latestAccountSnapshot.availableMargin} /></dd></div>
                <div><dt className="text-slate-400">Used margin</dt><dd><NumberValue value={data.latestAccountSnapshot.usedMargin} /></dd></div>
                <div><dt className="text-slate-400">Unrealized PnL</dt><dd><NumberValue value={data.latestAccountSnapshot.unrealizedPnl} /></dd></div>
                <div><dt className="text-slate-400">Realized PnL</dt><dd><NumberValue value={data.latestAccountSnapshot.realizedPnl} /></dd></div>
                <div><dt className="text-slate-400">Daily loss %</dt><dd><NumberValue value={data.latestAccountSnapshot.dailyLossPct} /></dd></div>
                <div><dt className="text-slate-400">Trailing drawdown %</dt><dd><NumberValue value={data.latestAccountSnapshot.trailingDrawdownPct} /></dd></div>
                <div><dt className="text-slate-400">Open risk %</dt><dd><NumberValue value={data.latestAccountSnapshot.openRiskPct} /></dd></div>
                <div className="md:col-span-2 xl:col-span-3"><dt className="text-slate-400">Captured at</dt><dd>{new Date(data.latestAccountSnapshot.capturedAt).toISOString()}</dd></div>
              </dl>
            ) : (
              <p className="text-sm text-slate-400">No prop account snapshot persisted yet.</p>
            )}
          </section>

          <section className="rounded border border-slate-800 bg-slate-900/70 p-4">
            <h2 className="mb-3 text-lg font-semibold">Open Positions</h2>
            <div className="overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="text-slate-400">
                    <th className="px-2 py-1">Symbol</th>
                    <th className="px-2 py-1">Side</th>
                    <th className="px-2 py-1">Size</th>
                    <th className="px-2 py-1">Entry</th>
                    <th className="px-2 py-1">Mark</th>
                    <th className="px-2 py-1">Unrealized PnL</th>
                    <th className="px-2 py-1">Drawdown Impact</th>
                    <th className="px-2 py-1">Status</th>
                    <th className="px-2 py-1">Opened At</th>
                  </tr>
                </thead>
                <tbody>
                  {data.openPositions.map((position) => (
                    <tr key={position.id} className="border-t border-slate-800">
                      <td className="px-2 py-1">{position.symbol}</td>
                      <td className="px-2 py-1">{position.side}</td>
                      <td className="px-2 py-1"><NumberValue value={position.size} /></td>
                      <td className="px-2 py-1"><NumberValue value={position.entryPrice} /></td>
                      <td className="px-2 py-1"><NumberValue value={position.markPrice} /></td>
                      <td className="px-2 py-1"><NumberValue value={position.unrealizedPnl} /></td>
                      <td className="px-2 py-1"><NumberValue value={position.drawdownImpact} /></td>
                      <td className="px-2 py-1">{position.status}</td>
                      <td className="px-2 py-1">{position.openedAt ? new Date(position.openedAt).toISOString() : "-"}</td>
                    </tr>
                  ))}
                  {data.openPositions.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-2 py-3 text-slate-400">No open prop positions yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded border border-slate-800 bg-slate-900/70 p-4">
            <h2 className="mb-3 text-lg font-semibold">Closed Positions</h2>
            <div className="overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="text-slate-400">
                    <th className="px-2 py-1">Symbol</th>
                    <th className="px-2 py-1">Side</th>
                    <th className="px-2 py-1">Size</th>
                    <th className="px-2 py-1">Entry</th>
                    <th className="px-2 py-1">Realized PnL</th>
                    <th className="px-2 py-1">Drawdown Impact</th>
                    <th className="px-2 py-1">Status</th>
                    <th className="px-2 py-1">Opened At</th>
                    <th className="px-2 py-1">Closed At</th>
                  </tr>
                </thead>
                <tbody>
                  {data.closedPositions.map((position) => (
                    <tr key={position.id} className="border-t border-slate-800">
                      <td className="px-2 py-1">{position.symbol}</td>
                      <td className="px-2 py-1">{position.side}</td>
                      <td className="px-2 py-1"><NumberValue value={position.size} /></td>
                      <td className="px-2 py-1"><NumberValue value={position.entryPrice} /></td>
                      <td className="px-2 py-1"><NumberValue value={position.realizedPnl} /></td>
                      <td className="px-2 py-1"><NumberValue value={position.drawdownImpact} /></td>
                      <td className="px-2 py-1">{position.status}</td>
                      <td className="px-2 py-1">{position.openedAt ? new Date(position.openedAt).toISOString() : "-"}</td>
                      <td className="px-2 py-1">{position.closedAt ? new Date(position.closedAt).toISOString() : "-"}</td>
                    </tr>
                  ))}
                  {data.closedPositions.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-2 py-3 text-slate-400">No closed prop positions yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded border border-slate-800 bg-slate-900/70 p-4">
            <h2 className="mb-3 text-lg font-semibold">Compliance Events</h2>
            <div className="overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="text-slate-400">
                    <th className="px-2 py-1">Event Type</th>
                    <th className="px-2 py-1">Lock Type</th>
                    <th className="px-2 py-1">Reason</th>
                    <th className="px-2 py-1">Severity</th>
                    <th className="px-2 py-1">Occurred At</th>
                  </tr>
                </thead>
                <tbody>
                  {data.complianceEvents.map((event) => (
                    <tr key={event.id} className="border-t border-slate-800">
                      <td className="px-2 py-1">{event.eventType}</td>
                      <td className="px-2 py-1">{event.lockType ?? "-"}</td>
                      <td className="px-2 py-1">{event.reason ?? "-"}</td>
                      <td className="px-2 py-1">{event.severity ?? "-"}</td>
                      <td className="px-2 py-1">{new Date(event.occurredAt).toISOString()}</td>
                    </tr>
                  ))}
                  {data.complianceEvents.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-2 py-3 text-slate-400">No prop compliance events yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded border border-slate-800 bg-slate-900/70 p-4">
            <h2 className="mb-3 text-lg font-semibold">Recent Runtime Events</h2>
            <ul className="space-y-2 text-sm">
              {data.recentEvents.map((event) => (
                <li key={event.id} className="rounded border border-slate-800 bg-slate-950/50 p-2">
                  <div className="font-medium text-slate-200">{event.eventType}</div>
                  <div className="text-slate-400">connector: {event.connector ?? "-"} · symbol: {event.symbol ?? "-"}</div>
                  <div className="text-slate-500">{new Date(event.occurredAt).toISOString()}</div>
                </li>
              ))}
              {data.recentEvents.length === 0 && <li className="text-slate-400">No prop runtime events yet.</li>}
            </ul>
          </section>
        </>
      )}
    </section>
  );
}
