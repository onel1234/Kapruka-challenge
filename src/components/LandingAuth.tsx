"use client";

import { Loader2 } from "lucide-react";
import { signIn } from "next-auth/react";
import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

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
  const [isModalOpen, setIsModalOpen] = useState(false);

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
    <div className="flex min-h-screen bg-slate-50 lg:bg-white font-sans text-slate-900 flex-col lg:flex-row">
      {/* Left side: Hero Image */}
      <div className="relative w-full h-[45vh] sm:h-[50vh] lg:h-auto lg:w-1/2 shrink-0">
        <img
          className="absolute inset-0 h-full w-full object-cover"
          src="/hero.png"
          alt="Premium gifts, cakes, and flowers from Kapruka"
        />
        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>
        
        {/* Brand messaging over image */}
        <div className="absolute bottom-8 lg:bottom-16 left-6 sm:left-12 lg:left-16 right-6 sm:right-12 lg:right-16 text-white pb-6 lg:pb-0 z-10">
          <h2 className="text-3xl lg:text-5xl font-bold mb-2 lg:mb-4 tracking-tight leading-tight drop-shadow-lg">Sri Lanka&apos;s Premier Gift Concierge</h2>
          <p className="text-sm sm:text-base lg:text-lg opacity-95 max-w-lg leading-relaxed drop-shadow-md line-clamp-2 lg:line-clamp-none">
            Let Kavi help you find the perfect gift for your loved ones. Explore our exquisite collection of cakes, flowers, and premium hampers.
          </p>
        </div>
      </div>

      {/* Right side: Auth Form */}
      <div className="flex flex-1 w-full flex-col px-6 sm:px-12 lg:w-1/2 lg:px-24 xl:px-32 relative py-8 lg:py-12 bg-white rounded-t-[2.5rem] -mt-8 lg:mt-0 lg:rounded-none z-20 shadow-[0_-12px_30px_rgba(0,0,0,0.1)] lg:shadow-none">
        {/* Top Navigation inside Auth Pane */}
        <div className="w-full flex justify-between items-center mb-8 shrink-0">
          <a className="font-bold text-primary hover:opacity-80 transition-opacity block w-28" href="#">
            <img alt="Kapruka Logo" className="w-full h-auto object-contain" src="/images.png" />
          </a>
          <button onClick={() => setIsModalOpen(true)} className="text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-2 text-sm font-medium">
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 0" }}>info</span>
            About Kavi
          </button>
        </div>

        <div className="w-full max-w-md mx-auto fade-in-up flex-1 flex flex-col justify-center">
          <div className="mb-8 lg:mb-10 text-center lg:text-left">
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900 mb-2 lg:mb-3">
              {mode === "signin" ? "Welcome back" : "Create an account"}
            </h1>
            <p className="text-sm lg:text-base text-slate-500">
              {mode === "signin" 
                ? "Enter your details to sign in to your Kapruka account." 
                : "Join Kapruka to experience premium gift delivery in Sri Lanka."}
            </p>
          </div>

          <form className="space-y-5" onSubmit={submitAuth}>
            {mode === "signup" && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="name">Full Name</label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#fdd818]/50 focus:border-[#fdd818] transition-all bg-slate-50 hover:bg-white placeholder:text-slate-400"
                  placeholder="Enter your name"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="email">Email or Phone</label>
              <input
                id="email"
                type="text"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#fdd818]/50 focus:border-[#fdd818] transition-all bg-slate-50 hover:bg-white placeholder:text-slate-400"
                placeholder="Enter your details"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="password">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 pr-16 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#fdd818]/50 focus:border-[#fdd818] transition-all bg-slate-50 hover:bg-white placeholder:text-slate-400"
                  placeholder="••••••••"
                />
                <button type="button" className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors">Hide</button>
              </div>
            </div>

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-[#fdd818] text-[#1b1c1a] font-semibold text-base py-3.5 rounded-xl hover:bg-[#ebd019] transition-all duration-200 shadow-sm disabled:opacity-60 mt-4"
            >
              {isLoading && <Loader2 size={18} className="animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="mt-8 mb-6 relative">
            <div aria-hidden="true" className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-slate-500 font-medium">Or continue with</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => signIn("google", { callbackUrl: "/chat" })}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors font-medium text-slate-700 shadow-sm"
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
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors font-medium text-slate-700 shadow-sm disabled:opacity-60"
            >
              {isGuestLoading ? <Loader2 size={18} className="animate-spin" /> : <span className="material-symbols-outlined text-[20px]">person</span>}
              Guest
            </button>
          </div>

          <div className="mt-8 text-center text-sm text-slate-500">
            {mode === "signin" ? (
              <>
                Don&apos;t have an account?{" "}
                <button type="button" onClick={() => setMode("signup")} className="text-slate-900 font-semibold hover:underline">
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button type="button" onClick={() => setMode("signin")} className="text-slate-900 font-semibold hover:underline">
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
        
        {/* Footer inside Auth Pane */}
        <div className="w-full flex flex-col md:flex-row justify-between items-center text-xs text-slate-400 mt-8 gap-3 lg:gap-4 shrink-0">
          <div>© 2024 Kapruka. All rights reserved.</div>
          <div className="flex gap-4">
            <a className="hover:text-slate-600 transition-colors" href="https://github.com/onel1234" target="_blank" rel="noopener noreferrer">Github</a>
            <a className="hover:text-slate-600 transition-colors" href="https://www.linkedin.com/in/wathila-ranaweera-3558aa1b7/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
            <a className="hover:text-slate-600 transition-colors" href="https://github.com/onel1234/Kapruka-challenge" target="_blank" rel="noopener noreferrer">Code</a>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setIsModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", bounce: 0.3, duration: 0.6 }}
              className="relative bg-white rounded-2xl shadow-2xl p-8 max-w-lg w-full overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#fdd818] to-orange-400" />
              <button 
                onClick={() => setIsModalOpen(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
              
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-[28px]">robot_2</span>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">About Kavi</h2>
                  <p className="text-slate-500 text-sm font-medium">Your Personal Gift Concierge</p>
                </div>
              </div>

              <div className="space-y-4 text-slate-700 leading-relaxed">
                <p>
                  Kavi is an AI-powered shopping assistant exclusive to Kapruka. She is designed to make gifting effortless and personalized.
                </p>
                
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <h3 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#fdd818] text-[20px]">auto_awesome</span>
                    What can Kavi do?
                  </h3>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-slate-400 text-[18px]">check_circle</span>
                      <span><strong>Smart Recommendations:</strong> Tell Kavi who the gift is for, and she'll suggest the perfect items.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-slate-400 text-[18px]">check_circle</span>
                      <span><strong>Seamless Ordering:</strong> Add items to your cart and checkout effortlessly.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-slate-400 text-[18px]">check_circle</span>
                      <span><strong>Personalized Bundles:</strong> Kavi can curate a cake, flowers, and a card together for a complete package.</span>
                    </li>
                  </ul>
                </div>

                <p>
                  Simply type what you're looking for, and let Kavi handle the rest. Gifting has never been this simple!
                </p>
              </div>

              <div className="mt-8">
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="w-full bg-slate-900 text-white font-semibold py-3 rounded-xl hover:bg-slate-800 transition-colors"
                >
                  Got it, thanks!
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
