"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm(props: { nextPath: string; initialError: string | null }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(props.initialError);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password })
    });
    setLoading(false);
    if (!res.ok) {
      const payload = await res.json().catch(() => ({ error: "login_failed" }));
      setError(payload.error ?? "login_failed");
      return;
    }
    router.push(props.nextPath);
    router.refresh();
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={onSubmit}>
      <label className="block text-sm text-slate-300">
        Password
        <input
          type="password"
          className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoFocus
          required
        />
      </label>
      {error && <p className="rounded border border-rose-700/60 bg-rose-900/30 p-2 text-xs text-rose-200">{error}</p>}
      <button
        type="submit"
        className="w-full rounded border border-emerald-700/60 bg-emerald-900/30 px-3 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-900/50 disabled:opacity-60"
        disabled={loading}
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
