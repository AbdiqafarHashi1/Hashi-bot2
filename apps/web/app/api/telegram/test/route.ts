import { NextResponse } from "next/server";
import { getConfig } from "@hashi/config";

export async function POST() {
  const config = getConfig();
  if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_CHAT_ID) {
    return NextResponse.json({ ok: false, reason: "telegram_not_configured" }, { status: 400 });
  }
  const text = `HashiBot Telegram test\nmode=${config.CAPITAL_MODE}\nmin_tier=A+`;
  const res = await fetch(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: config.TELEGRAM_CHAT_ID, text })
  });
  const body = await res.json();
  return NextResponse.json({ ok: res.ok && body?.ok === true, reason: body?.description ?? null, status: res.status });
}
