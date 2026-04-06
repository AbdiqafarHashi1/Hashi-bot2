"use client";

import { useEffect, useState } from "react";

type RuntimeEvent = {
  id: string;
  type: string;
  mode: string;
  symbol: string | null;
  message: string | null;
  createdAt: string;
};

type Incident = {
  id: string;
  severity: "info" | "warning" | "critical" | string;
  source: string;
  message: string;
  resolved: boolean;
  createdAt: string;
};

type TransportEvent = {
  id: string;
  channel: string;
  status: "sent" | "failed" | string;
  message: string;
  createdAt: string;
};

export default function RuntimePage() {
  const [runtimeEvents, setRuntimeEvents] = useState<RuntimeEvent[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [transportEvents, setTransportEvents] = useState<TransportEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    Promise.all([
      fetch("/api/runtime-events").then((res) => (res.ok ? res.json() : null)),
      fetch("/api/incidents").then((res) => (res.ok ? res.json() : null)),
      fetch("/api/transport-events").then((res) => (res.ok ? res.json() : null))
    ])
      .then(([runtimeRes, incidentsRes, transportRes]) => {
        if (!mounted) return;
        setRuntimeEvents((runtimeRes?.events ?? []) as RuntimeEvent[]);
        setIncidents((incidentsRes?.incidents ?? []) as Incident[]);
        setTransportEvents((transportRes?.events ?? []) as TransportEvent[]);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Unable to load runtime observability feeds");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const severityTone = (severity: string) => {
    if (severity === "critical") return "text-rose-300";
    if (severity === "warning") return "text-amber-300";
    return "text-slate-300";
  };

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-3xl font-bold">Runtime</h1>
        <p className="mt-1 text-sm text-slate-400">Persisted runtime events, incidents, and transport activity.</p>
      </header>

      {loading && <p className="rounded border border-slate-800 bg-slate-900/70 p-3 text-sm text-slate-300">Loading runtime feeds…</p>}
      {error && <p className="rounded border border-rose-700/50 bg-rose-900/20 p-3 text-sm text-rose-200">{error}</p>}

      <section className="rounded border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="mb-3 text-lg font-semibold">Runtime Events Feed</h2>
        <ul className="space-y-2 text-sm">
          {runtimeEvents.map((event) => (
            <li key={event.id} className="rounded border border-slate-800 bg-slate-950/50 p-2">
              <div className="font-medium text-slate-200">{event.type} · mode={event.mode}</div>
              <div className="text-slate-400">symbol: {event.symbol ?? "-"} · {event.message ?? "-"}</div>
              <div className="text-slate-500">{new Date(event.createdAt).toISOString()}</div>
            </li>
          ))}
          {runtimeEvents.length === 0 && <li className="text-slate-400">No runtime events yet.</li>}
        </ul>
      </section>

      <section className="rounded border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="mb-3 text-lg font-semibold">Incidents Panel</h2>
        <ul className="space-y-2 text-sm">
          {incidents.map((incident) => (
            <li key={incident.id} className="rounded border border-slate-800 bg-slate-950/50 p-2">
              <div className={`font-medium ${severityTone(incident.severity)}`}>
                {incident.severity.toUpperCase()} · {incident.resolved ? "resolved" : "unresolved"}
              </div>
              <div className="text-slate-300">{incident.source}: {incident.message}</div>
              <div className="text-slate-500">{new Date(incident.createdAt).toISOString()}</div>
            </li>
          ))}
          {incidents.length === 0 && <li className="text-slate-400">No incidents recorded.</li>}
        </ul>
      </section>

      <section className="rounded border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="mb-3 text-lg font-semibold">Transport Activity</h2>
        <ul className="space-y-2 text-sm">
          {transportEvents.map((event) => (
            <li key={event.id} className="rounded border border-slate-800 bg-slate-950/50 p-2">
              <div className="font-medium text-slate-200">{event.channel} · {event.status}</div>
              <div className="text-slate-400">{event.message}</div>
              <div className="text-slate-500">{new Date(event.createdAt).toISOString()}</div>
            </li>
          ))}
          {transportEvents.length === 0 && <li className="text-slate-400">No transport activity yet.</li>}
        </ul>
      </section>
    </section>
  );
}
