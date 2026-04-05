"use client";

import { useEffect, useState } from "react";
import type { ControlRoomStatePayload } from "./contracts";

export function useControlRoomState() {
  const [data, setData] = useState<ControlRoomStatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/control-room/state")
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json() as Promise<ControlRoomStatePayload>;
      })
      .then((json) => {
        if (!mounted) return;
        setData(json);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setData(null);
        setError(err instanceof Error ? err.message : "Unable to load control-room state");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return { data, loading, error };
}
