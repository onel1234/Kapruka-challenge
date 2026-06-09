import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

export const GUEST_SESSION_COOKIE = "kapruka_guest_session";
const GUEST_TTL_DAYS = 30;

function guestExpiry() {
  const expires = new Date();
  expires.setDate(expires.getDate() + GUEST_TTL_DAYS);
  return expires;
}

export async function getGuestToken() {
  return (await cookies()).get(GUEST_SESSION_COOKIE)?.value ?? null;
}

export async function createOrRefreshGuestSession() {
  const cookieStore = await cookies();
  const existingToken = cookieStore.get(GUEST_SESSION_COOKIE)?.value;
  const token = existingToken ?? randomUUID();
  const expiresAt = guestExpiry();

  const guestSession = await prisma.guestSession.upsert({
    where: { token },
    create: { token, expiresAt },
    update: { expiresAt },
  });

  cookieStore.set(GUEST_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return guestSession;
}

export async function getValidGuestSession() {
  const token = await getGuestToken();

  if (!token) {
    return null;
  }

  const guestSession = await prisma.guestSession.findUnique({
    where: { token },
  });

  if (!guestSession || guestSession.expiresAt < new Date() || guestSession.migratedAt) {
    return null;
  }

  return guestSession;
}
