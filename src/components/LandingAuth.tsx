"use client";

import { Loader2 } from "lucide-react";
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
    <div className="bg-surface-cream text-on-background min-h-screen flex flex-col relative overflow-hidden font-body-md">
      {/* Ambient Background */}
      <div className="absolute inset-0 z-0 overflow-hidden opacity-40"></div>

      {/* Floating Decorative Elements */}
      <div className="absolute inset-0 z-0 pointer-events-none hidden md:block">
        <img alt="Cake" className="absolute top-[20%] left-[15%] w-24 h-24 object-contain opacity-40 floating-icon" src="/cake.png" />
        <img alt="Flower" className="absolute top-[60%] left-[10%] w-20 h-20 object-contain opacity-40 floating-icon-delayed" src="/flower.png" />
        <img alt="Chocolate" className="absolute top-[30%] right-[15%] w-20 h-20 object-contain opacity-40 floating-icon" src="/chocolate.png" />
        <img alt="Food" className="absolute top-[70%] right-[10%] w-24 h-24 object-contain opacity-40 floating-icon-delayed" src="/food.png" />
      </div>

      {/* TopNavBar */}
      <nav className="bg-white fixed top-0 w-full flex justify-between items-center px-margin-mobile md:px-margin-desktop py-4 z-50">
        <div className="flex items-center">
          <a className="font-display-sm text-display-sm font-bold text-primary hover:opacity-80 transition-opacity hover:scale-[1.02] transition-transform duration-300 block w-32" href="#">
            <img alt="Kapruka Logo" className="w-full h-auto object-contain brightness-0" src="/logo.png" />
          </a>
        </div>
        <div className="hidden md:flex items-center space-x-6 font-body-md text-body-md"></div>
        <div className="flex items-center space-x-4">
          <button className="text-primary hover:opacity-80 transition-opacity">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>help</span>
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-grow flex items-center justify-center relative z-10 px-margin-mobile pt-[120px] pb-[80px]">
        <div className="glass-panel rounded-2xl w-full max-w-[480px] p-8 md:p-12 fade-in-up">
          <div className="text-center mb-8">
            <h1 className="font-display-sm text-display-sm text-primary mb-2">Meet Kavi, your Gift Concierge</h1>
            <p className="font-body-md text-body-md text-on-surface-variant">Let me help you find the perfect gift for your loved ones.</p>
          </div>

          <form className="space-y-6" onSubmit={submitAuth}>
            <div className="space-y-4">
              {mode === "signup" && (
                <div className="relative">
                  <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1 ml-1" htmlFor="name">Full Name</label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="w-full bg-surface-cream/50 border border-outline-variant/30 rounded-lg px-4 py-3 font-body-md text-body-md text-on-background focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/50"
                    placeholder="Enter your name"
                  />
                </div>
              )}

              <div className="relative">
                <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1 ml-1" htmlFor="email">Email or Phone</label>
                <input
                  id="email"
                  type="text"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full bg-surface-cream/50 border border-outline-variant/30 rounded-lg px-4 py-3 font-body-md text-body-md text-on-background focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/50"
                  placeholder="Enter your details"
                />
              </div>

              <div className="relative">
                <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1 ml-1" htmlFor="password">Password</label>
                <div className="relative">
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full bg-surface-cream/50 border border-outline-variant/30 rounded-lg px-4 py-3 font-body-md text-body-md text-on-background focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/50 pr-12"
                    placeholder="••••••••"
                  />
                  <button type="button" className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-on-surface-variant">Hide</button>
                </div>
              </div>
            </div>

            {error && (
              <p className="rounded-lg border border-error-red/30 bg-error-red/10 p-3 text-sm text-error-red font-label-md">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-[#fdd818] text-[#1b1c1a] font-label-md text-label-md py-4 rounded-xl hover:scale-[1.02] transition-transform duration-300 shadow-[0_4px_14px_0_rgba(253,216,24,0.39)] hover:shadow-[0_6px_20px_rgba(253,216,24,0.23)] disabled:opacity-60"
            >
              {isLoading && <Loader2 size={17} className="animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="mt-8 mb-6 relative">
            <div aria-hidden="true" className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-outline-variant/30"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white/50 text-on-surface-variant font-label-sm text-label-sm backdrop-blur-sm rounded-full">Or Sign in with</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => signIn("google", { callbackUrl: "/chat" })}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-outline-variant/30 bg-white/50 hover:bg-white transition-colors font-label-md text-label-md text-on-background"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"></path>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path>
              </svg>
              Google
            </button>
            <button
              type="button"
              onClick={() => void continueAsGuest()}
              disabled={isGuestLoading}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-outline-variant/30 bg-white/50 hover:bg-white transition-colors font-label-md text-label-md text-on-background disabled:opacity-60"
            >
              {isGuestLoading ? <Loader2 size={17} className="animate-spin" /> : <span className="material-symbols-outlined text-[20px]">person</span>}
              Continue as Guest
            </button>
          </div>

          <div className="mt-8 text-center font-label-md text-label-md text-on-surface-variant">
            {mode === "signin" ? (
              <>
                Don&apos;t have an account?{" "}
                <button type="button" onClick={() => setMode("signup")} className="text-primary font-semibold hover:underline">
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button type="button" onClick={() => setMode("signin")} className="text-primary font-semibold hover:underline">
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-surface-cream w-full py-8 mt-auto flex flex-col md:flex-row justify-between items-center gap-4 px-margin-mobile md:px-margin-desktop z-20 relative">
        <div className="font-label-sm text-label-sm text-on-background">
          © 2024 Kapruka. Sri Lanka&apos;s largest e-commerce store.
        </div>
        <div className="flex gap-4">
          <a className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-colors" href="#">Terms of Service</a>
          <a className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-colors" href="#">Privacy Policy</a>
          <a className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-colors" href="#">Contact Us</a>
        </div>
      </footer>
    </div>
  );
}
