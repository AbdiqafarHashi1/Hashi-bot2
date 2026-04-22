import { NextResponse } from "next/server";
import { ensureControlRow, resolvePrisma } from "../_shared";
import { readSystemControlFile, writeSystemControlFile } from "../../../../lib/system-control-store";

export async function POST() {
  const prisma = await resolvePrisma();
  if (!prisma) {
    const existing = await readSystemControlFile();
    if (existing.isRunning) return NextResponse.json({ message: "already_running", control: existing }, { status: 409 });
    const control = await writeSystemControlFile({ isRunning: true });
    return NextResponse.json({ control });
  }
  const existing = await ensureControlRow(prisma);
  if (!existing) {
    const fallback = await readSystemControlFile();
    if (fallback.isRunning) return NextResponse.json({ message: "already_running", control: fallback }, { status: 409 });
    const control = await writeSystemControlFile({ isRunning: true });
    return NextResponse.json({ control });
  }
  if (existing.isRunning) return NextResponse.json({ message: "already_running", control: existing }, { status: 409 });
  const control = await prisma.systemControl.update({
    where: { id: existing.id },
    data: { isRunning: true }
  });
  await writeSystemControlFile({
    isRunning: true,
    activeMode: control.activeMode as "signal" | "personal" | "prop",
    allowedSymbols: control.allowedSymbols,
    killSwitchActive: control.killSwitchActive,
    updatedAt: control.updatedAt.toISOString()
  });
  return NextResponse.json({ control });
}
