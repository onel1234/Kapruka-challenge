import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authOptions } from "@/lib/auth";
import { GUEST_SESSION_COOKIE, getValidGuestSession } from "@/lib/guest";
import { migrateGuestToUser } from "@/lib/actor";

export const runtime = "nodejs";

export async function POST() {
  const session = await getServerSession(authOptions);
  const guestSession = await getValidGuestSession();

  if (!session?.user?.id || !guestSession) {
    return NextResponse.json({ ok: true, imported: false });
  }

  await migrateGuestToUser(guestSession.id, session.user.id);
  (await cookies()).set(GUEST_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });

  return NextResponse.json({ ok: true, imported: true });
}
