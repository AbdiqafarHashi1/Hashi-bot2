import type { ReactNode } from "react";

type Tone = "ready" | "warn" | "neutral" | "disabled";

const toneStyles: Record<Tone, string> = {
  ready: "border-emerald-600/40 bg-emerald-500/10 text-emerald-300",
  warn: "border-amber-600/40 bg-amber-500/10 text-amber-300",
  neutral: "border-slate-700 bg-slate-800/70 text-slate-300",
  disabled: "border-slate-700 bg-slate-800/40 text-slate-500"
};

export function StatusBadge({ tone, label }: { tone: Tone; label: string }) {
  return <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${toneStyles[tone]}`}>{label}</span>;
}

export function Card({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <article className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-slate-200">{title}</h2>
        {right}
      </header>
      {children}
    </article>
  );
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-slate-800 py-2 text-sm first:border-t-0 first:pt-0">
      <span className="text-slate-400">{label}</span>
      <span className="text-right text-slate-100">{value}</span>
    </div>
  );
}

export function PageState({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) {
    return <p className="rounded border border-slate-800 bg-slate-900/70 p-3 text-sm text-slate-300">Loading control-room state…</p>;
  }

  if (error) {
    return <p className="rounded border border-rose-700/50 bg-rose-900/20 p-3 text-sm text-rose-200">{error}</p>;
  }

  return null;
}
