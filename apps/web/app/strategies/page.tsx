"use client";

import { Card, KeyValue, PageState, StatusBadge } from "../../components/control-room-ui";
import { useControlRoomState } from "../../lib/control-room/client";

export default function Page() {
  const { data, loading, error } = useControlRoomState();

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-3xl font-bold">Strategies</h1>
        <p className="mt-1 text-sm text-slate-400">Read-only runtime strategy posture and symbol context from current backend state.</p>
      </header>

      <PageState loading={loading} error={error} />

      {data && (
        <div className="grid gap-3 xl:grid-cols-2">
          <Card title="Production Strategy">
            <KeyValue label="Selected active" value={data.strategies.selectedActiveStrategy} />
            <KeyValue label="Active IDs" value={data.strategies.activeProductionStrategyIds.join(", ")} />
            <KeyValue label="Available production set" value={data.strategies.productionStrategies.join(", ")} />
            <KeyValue
              label="Research mode"
              value={<StatusBadge tone={data.strategies.swingResearchModeEnabled ? "warn" : "neutral"} label={data.strategies.swingResearchModeEnabled ? "enabled" : "disabled"} />}
            />
          </Card>

          <Card title="Breakout Runtime Flags">
            <KeyValue label="Execution mode" value={data.mode.executionMode} />
            <KeyValue label="Entry mode" value={data.mode.breakoutEntryMode} />
            <KeyValue label="Operating mode" value={data.mode.breakoutOperatingMode} />
            <KeyValue label="Edge profile" value={data.mode.breakoutEdgeProfile ?? "not exposed"} />
          </Card>

          <Card title="Crypto Symbol Set">
            <ul className="space-y-1 text-sm text-slate-200">
              {data.symbols.crypto.length > 0 ? data.symbols.crypto.map((symbol) => <li key={symbol}>{symbol}</li>) : <li>none configured</li>}
            </ul>
          </Card>

          <Card title="Forex Symbol Set">
            <ul className="space-y-1 text-sm text-slate-200">
              {data.symbols.forex.length > 0 ? data.symbols.forex.map((symbol) => <li key={symbol}>{symbol}</li>) : <li>none configured</li>}
            </ul>
          </Card>
        </div>
      )}
    </section>
  );
}
