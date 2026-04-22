import { NextResponse } from "next/server";
import { ensureControlRow, resolvePrisma } from "../_shared";
import { readSystemControlFile } from "../../../../lib/system-control-store";

export async function GET() {
  const prisma = await resolvePrisma();
  if (!prisma) return NextResponse.json({ control: await readSystemControlFile() });
  const control = await ensureControlRow(prisma);
  if (!control) return NextResponse.json({ control: await readSystemControlFile() });
  return NextResponse.json({ control });
}
