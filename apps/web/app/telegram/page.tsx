"use client";

import { Card, KeyValue, PageState, StatusBadge } from "../../components/control-room-ui";
import { useControlRoomState } from "../../lib/control-room/client";
import { useState } from "react";

export default function Page() {
  const { data, loading, error } = useControlRoomState();
  const [testResult, setTestResult] = useState<string>("");

  async function runTest(kind: "entry" | "result" | "full") {
    const res = await fetch("/api/telegram/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) });
    const payload = await res.json().catch(() => null) as { ok?: boolean; reason?: string; status?: string } | null;
    setTestResult(payload?.ok ? `${kind.toUpperCase()} test sent` : `${kind.toUpperCase()} failed: ${payload?.reason ?? payload?.status ?? "unknown"}`);
  }

  return <section className="space-y-5">
    <header><h1 className="text-3xl font-bold">Telegram Delivery</h1></header>
    <PageState loading={loading} error={error} />
    {data && <div className="grid gap-3 xl:grid-cols-2">
      <Card title="Telegram State">
        <KeyValue label="Token configured" value={<StatusBadge tone={data.telegram.tokenPresent ? "ready" : "warn"} label={data.telegram.tokenPresent ? "yes" : "no"} />} />
        <KeyValue label="Chat ID configured" value={<StatusBadge tone={data.telegram.chatIdPresent ? "ready" : "warn"} label={data.telegram.chatIdPresent ? "yes" : "no"} />} />
        <KeyValue label="Entry dispatch enabled" value={<StatusBadge tone={data.telegram.signalOutputEnabled ? "ready" : "disabled"} label={data.telegram.signalOutputEnabled ? "yes" : "no"} />} />
        <KeyValue label="Result dispatch enabled" value={<StatusBadge tone={data.telegram.signalOutputEnabled ? "ready" : "disabled"} label={data.telegram.signalOutputEnabled ? "yes" : "no"} />} />
        <KeyValue label="Last ENTRY sent" value={data.timestamp} />
        <KeyValue label="Last RESULT sent" value={data.timestamp} />
        <KeyValue label="Last dispatch error" value={data.systemStatus.notes || "none"} />
      </Card>
      <Card title="Telegram Tests">
        <div className="flex flex-wrap gap-2">
          <button className="rounded bg-teal-700 px-3 py-2 text-sm" onClick={() => runTest("entry")}>Send Test Entry</button>
          <button className="rounded bg-teal-700 px-3 py-2 text-sm" onClick={() => runTest("result")}>Send Test Result</button>
          <button className="rounded bg-teal-700 px-3 py-2 text-sm" onClick={() => runTest("full")}>Send Full Test Sequence</button>
        </div>
        {testResult ? <p className="mt-2 text-xs text-slate-300">{testResult}</p> : null}
      </Card>
    </div>}
  </section>;
}
