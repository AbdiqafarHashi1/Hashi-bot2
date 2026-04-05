import { NextResponse } from "next/server";
import { buildControlRoomState } from "../../../../lib/control-room/state";

export async function GET() {
  const state = await buildControlRoomState();
  return NextResponse.json(state);
}
