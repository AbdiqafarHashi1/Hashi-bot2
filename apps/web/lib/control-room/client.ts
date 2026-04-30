"use client";

import { useEffect, useState } from "react";
import type { ControlRoomStatePayload } from "./contracts";
import { mapApiError } from "./error";

export function useControlRoomState() {
  const [data, setData] = useState<ControlRoomStatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = () => fetch("/api/control-room/state", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { message?: string; code?: string; traceId?: string } | null;
          throw new Error(mapApiError(res.status, payload));
        }
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

    void load();
    const timer = setInterval(() => void load(), 7000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  return { data, loading, error };
}
