import { NextResponse } from "next/server";
import { createOrRefreshGuestSession } from "@/lib/guest";

export const runtime = "nodejs";

export async function POST() {
  await createOrRefreshGuestSession();
  return NextResponse.json({ ok: true });
}
