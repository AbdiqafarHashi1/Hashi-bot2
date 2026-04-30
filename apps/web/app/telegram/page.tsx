"use client";

import { Card, KeyValue, PageState, StatusBadge } from "../../components/control-room-ui";
import { useControlRoomState } from "../../lib/control-room/client";
import { useState } from "react";

export default function Page() {
  const { data, loading, error } = useControlRoomState();
  const [testResult, setTestResult] = useState<string>("");

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-3xl font-bold">Telegram Delivery</h1>
        <p className="mt-1 text-sm text-slate-400">Read-only Telegram transport visibility for signal messages. No secret values are exposed.</p>
      </header>

      <PageState loading={loading} error={error} />

      {data && (
        <div className="grid gap-3 xl:grid-cols-2">
          <Card title="Telegram Output">
            <KeyValue
              label="Signal output enabled"
              value={<StatusBadge tone={data.telegram.signalOutputEnabled ? "ready" : "disabled"} label={data.telegram.signalOutputEnabled ? "enabled" : "disabled"} />}
            />
            <KeyValue
              label="Bot token present"
              value={<StatusBadge tone={data.telegram.tokenPresent ? "ready" : "warn"} label={data.telegram.tokenPresent ? "yes" : "no"} />}
            />
            <KeyValue
              label="Chat ID present"
              value={<StatusBadge tone={data.telegram.chatIdPresent ? "ready" : "warn"} label={data.telegram.chatIdPresent ? "yes" : "no"} />}
            />
            <KeyValue label="Parse mode" value={data.telegram.parseMode} />
          </Card>

          <Card title="Transport + Mode Notes">
            <KeyValue
              label="Message template"
              value={<StatusBadge tone={data.telegram.templateReady ? "ready" : "warn"} label={data.telegram.templateReady ? "ready" : "pending"} />}
            />
            <KeyValue label="Execution mode" value={data.mode.executionMode} />
            <p className="mt-2 text-sm text-slate-300">{data.telegram.notes}</p>
            <button
              className="mt-3 rounded bg-teal-700 px-3 py-2 text-sm font-medium hover:bg-teal-600"
              onClick={async () => {
                const res = await fetch("/api/telegram/test", { method: "POST" });
                const payload = await res.json();
                setTestResult(payload.ok ? "success" : `failed: ${payload.reason ?? payload.status}`);
              }}
            >
              Send Test Message
            </button>
            {testResult ? <p className="mt-2 text-xs text-slate-300">{testResult}</p> : null}
          </Card>
        </div>
      )}
    </section>
  );
}
