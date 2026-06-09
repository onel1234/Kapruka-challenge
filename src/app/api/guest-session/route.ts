import { NextResponse } from "next/server";
import { createOrRefreshGuestSession } from "@/lib/guest";

export const runtime = "nodejs";

export async function POST() {
  try {
    await createOrRefreshGuestSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const prismaError = error as { code?: string; message?: string };
    console.error("Guest session failed", error);

    return NextResponse.json(
      {
        error: "Could not start guest session.",
        code: prismaError.code ?? "guest_session_failed",
        detail:
          process.env.NODE_ENV === "production"
            ? "Check Vercel function logs for the full database error."
            : prismaError.message,
      },
      { status: 500 },
    );
  }
}
