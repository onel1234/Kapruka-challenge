"use client";

import { Gift, Loader2, Lock, Mail, Sparkles, User } from "lucide-react";
import { signIn } from "next-auth/react";
import { FormEvent, useEffect, useState } from "react";

type AuthMode = "signin" | "signup";

async function readErrorMessage(response: Response, fallback: string) {
  const text = await response.text();

  if (!text) return fallback;

  try {
    const data = JSON.parse(text) as { error?: string; code?: string };
    return data.code ? `${data.error ?? fallback} (${data.code})` : data.error ?? fallback;
  } catch {
    return text.slice(0, 180);
  }
}

export default function LandingAuth() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGuestLoading, setIsGuestLoading] = useState(false);

  useEffect(() => {
    const authError = new URLSearchParams(window.location.search).get("error");

    if (authError) {
      const timeoutId = window.setTimeout(() => {
        setError(`Authentication failed (${authError}). Please try again.`);
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }
  }, []);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (mode === "signup") {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response, "Could not create account."));
        }
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: "/chat",
      });

      if (result?.error) {
        throw new Error("Invalid email or password.");
      }

      window.location.href = "/chat";
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Authentication failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function continueAsGuest() {
    setError(null);
    setIsGuestLoading(true);

    try {
      const response = await fetch("/api/guest-session", { method: "POST" });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Could not start guest session."));
      }

      window.location.href = "/chat";
    } catch (guestError) {
      setError(guestError instanceof Error ? guestError.message : "Guest mode failed.");
    } finally {
      setIsGuestLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#fffaf0] text-[#1d1a16]">
      <section className="grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(0,1fr)_460px]">
        <div className="flex flex-col justify-between bg-[#f8efe0] px-6 py-8 sm:px-10 lg:px-14">
          <header className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#cc2f2f] text-white">
              <Gift size={22} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#85653a]">Kapruka Challenge Demo</p>
              <h1 className="text-2xl font-semibold">Kavi Gift Concierge</h1>
            </div>
          </header>

          <div className="my-16 max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-lg border border-[#eadfc9] bg-white px-3 py-2 text-sm font-medium text-[#6b5d4c]">
              <Sparkles size={16} className="text-[#cc2f2f]" />
              AI gift shopping for Sri Lanka
            </div>
            <h2 className="max-w-2xl text-5xl font-semibold leading-tight text-[#211b15] sm:text-6xl">
              Find the right gift, check delivery, and create a Kapruka checkout link.
            </h2>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#665847]">
              Search live Kapruka products, build multi-item gift carts, use Sinhala or Tamil, and continue past chats whenever you return.
            </p>
          </div>

          <div className="grid max-w-3xl gap-3 text-sm text-[#665847] sm:grid-cols-3">
            <div className="rounded-lg border border-[#e2d1b7] bg-white p-4">Live Kapruka MCP product search</div>
            <div className="rounded-lg border border-[#e2d1b7] bg-white p-4">Guest or signed-in conversations</div>
            <div className="rounded-lg border border-[#e2d1b7] bg-white p-4">Checkout links with delivery fees</div>
          </div>
        </div>

        <aside className="flex items-center bg-[#1d1a16] p-6 text-white sm:p-10">
          <div className="w-full rounded-lg border border-white/10 bg-white/[0.06] p-5">
            <div className="mb-5 flex rounded-lg border border-white/10 bg-black/20 p-1">
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`h-10 flex-1 rounded-md text-sm font-semibold ${mode === "signin" ? "bg-[#f2c678] text-[#1d1a16]" : "text-white/70"}`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`h-10 flex-1 rounded-md text-sm font-semibold ${mode === "signup" ? "bg-[#f2c678] text-[#1d1a16]" : "text-white/70"}`}
              >
                Sign up
              </button>
            </div>

            <button
              type="button"
              onClick={() => signIn("google", { callbackUrl: "/chat" })}
              className="flex h-12 w-full items-center justify-center rounded-lg bg-white font-semibold text-[#1d1a16] transition hover:bg-[#f4ead8]"
            >
              Continue with Google
            </button>

            <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-white/45">
              <span className="h-px flex-1 bg-white/10" />
              or
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <form onSubmit={submitAuth} className="space-y-3">
              {mode === "signup" ? (
                <label className="relative block">
                  <User size={15} className="absolute left-3 top-3.5 text-white/45" />
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="h-12 w-full rounded-lg border border-white/10 bg-black/20 pl-9 pr-3 text-sm outline-none focus:border-[#f2c678]"
                    placeholder="Full name"
                  />
                </label>
              ) : null}
              <label className="relative block">
                <Mail size={15} className="absolute left-3 top-3.5 text-white/45" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-12 w-full rounded-lg border border-white/10 bg-black/20 pl-9 pr-3 text-sm outline-none focus:border-[#f2c678]"
                  placeholder="Email"
                />
              </label>
              <label className="relative block">
                <Lock size={15} className="absolute left-3 top-3.5 text-white/45" />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-12 w-full rounded-lg border border-white/10 bg-black/20 pl-9 pr-3 text-sm outline-none focus:border-[#f2c678]"
                  placeholder="Password"
                />
              </label>

              <button
                type="submit"
                disabled={isLoading}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#f2c678] font-semibold text-[#1d1a16] transition hover:bg-[#ffd98d] disabled:opacity-60"
              >
                {isLoading ? <Loader2 size={17} className="animate-spin" /> : null}
                {mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>

            <button
              type="button"
              onClick={() => void continueAsGuest()}
              disabled={isGuestLoading}
              className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-white/15 font-semibold text-white transition hover:bg-white/10 disabled:opacity-60"
            >
              {isGuestLoading ? <Loader2 size={17} className="animate-spin" /> : null}
              Continue as guest
            </button>

            {error ? (
              <p className="mt-4 rounded-lg border border-[#ff8f8f]/30 bg-[#7a1f1f]/40 p-3 text-sm text-[#ffd0d0]">
                {error}
              </p>
            ) : null}
          </div>
        </aside>
      </section>
    </main>
  );
}
