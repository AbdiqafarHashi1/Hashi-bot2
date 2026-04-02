import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const filePath = path.resolve(process.cwd(), "runtime/backtests/latest.json");
    const raw = await fs.readFile(filePath, "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({ message: "No backtest output found" }, { status: 404 });
  }
}
