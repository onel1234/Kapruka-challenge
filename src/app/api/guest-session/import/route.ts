import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getValidGuestSession } from "@/lib/guest";
import { migrateGuestToUser } from "@/lib/actor";

export const runtime = "nodejs";

export async function POST() {
  const session = await getServerSession(authOptions);
  const guestSession = await getValidGuestSession();

  if (!session?.user?.id || !guestSession) {
    return NextResponse.json({ ok: true, imported: false });
  }

  await migrateGuestToUser(guestSession.id, session.user.id);
  return NextResponse.json({ ok: true, imported: true });
}
