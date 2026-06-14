"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Blocks,
  BookUser,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleDot,
  MapPin,
  Plus,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { GiftAgentInsights } from "@/lib/types";

function formatMoney(amount: number, currency = "LKR") {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

type AgentCard = {
  id: string;
  name: string;
  tagline: string;
  icon: React.ReactNode;
  accentColor: string;
  bgColor: string;
  textColor: string;
  how: string[];
  when: string;
};

const AGENT_META: AgentCard[] = [
  {
    id: "bundle",
    name: "Bundle Builder",
    tagline: "Curates the perfect gift bundle from live search results",
    icon: <Blocks size={22} />,
    accentColor: "#1f4f4a",
    bgColor: "bg-[#1f4f4a]/10",
    textColor: "text-[#1f4f4a]",
    how: [
      "Picks a primary product that fits the budget",
      "Reads the emotional tone (apology, romantic, birthday…) to know which add-ons make sense",
      "Pulls from the recipient's saved preferences if known",
      "Adds complementary items (flowers, card, chocolates) staying within 115% of budget",
      "Returns a titled bundle with a total price and rationale",
    ],
    when: "Runs on every shopping response. Active when products are found.",
  },
  {
    id: "readiness",
    name: "Checkout Readiness",
    tagline: "Scores 0–100 how ready the cart is for checkout",
    icon: <ShieldCheck size={22} />,
    accentColor: "#cc2f2f",
    bgColor: "bg-[#cc2f2f]/10",
    textColor: "text-[#cc2f2f]",
    how: [
      "Inspects the live cart for at least one item",
      "Checks recipient name, phone; sender name; delivery address, city, date",
      "Deducts 13 points per missing required field",
      "Deducts 5 points per warning (no gift message, delivery concern)",
      "Sets status: blocked → needs_details → ready, with a nextAction suggestion",
    ],
    when: "Runs on every shopping response and every checkout attempt.",
  },
  {
    id: "substitution",
    name: "Substitution Agent",
    tagline: "Finds in-stock, on-budget swaps when products have issues",
    icon: <Shuffle size={22} />,
    accentColor: "#7c3aed",
    bgColor: "bg-[#7c3aed]/10",
    textColor: "text-[#7c3aed]",
    how: [
      "Scans for out-of-stock products in the current shelf",
      "Finds alternatives in the same category that are in-stock",
      "Checks if any product exceeds the stated budget; suggests affordable swaps",
      "If delivery is unavailable for the date, flags the top items with alternatives",
      "Returns up to 3 substitution groups, each with up to 3 alternatives",
    ],
    when: "Runs when there are out-of-stock items, budget overruns, or delivery issues.",
  },
  {
    id: "memory",
    name: "Recipient Memory",
    tagline: "Builds a persistent profile for named recipients",
    icon: <BookUser size={22} />,
    accentColor: "#d97706",
    bgColor: "bg-[#d97706]/10",
    textColor: "text-[#d97706]",
    how: [
      "Extracts a slugged recipientKey from the named recipient in the plan",
      "Skips generic names (friend, recipient, someone, user)",
      "Upserts a profile: merging occasions, preferred categories, cities, budget range, and notes",
      "Stores per-user or per-guest-session for privacy isolation",
      "On the next request for the same recipient, injects their history into the Bundle Builder",
    ],
    when: "Runs when a named (non-generic) recipient is detected in the conversation.",
  },
];

function HowItWorksToggle({ steps }: { steps: string[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 border-t border-[#f0e4cc] pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-xs font-semibold text-[#85653a] transition hover:text-[#5d4025]"
      >
        How it works
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {open && (
        <ol className="mt-3 space-y-2">
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-[#4f4638]">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#e8ddc9] text-[10px] font-bold text-[#6b5637]">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function BundleOutput({ insights }: { insights: GiftAgentInsights }) {
  if (!insights.bundle) {
    return (
      <p className="text-xs text-[#9a8878]">
        No bundle data yet. Ask Kavi for a gift recommendation to activate this agent.
      </p>
    );
  }

  const { bundle } = insights;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-[#1d1a16]">{bundle.title}</p>
        <p className="mt-1 text-xs text-[#756650]">{bundle.rationale}</p>
      </div>
      <div className="space-y-1.5">
        {bundle.itemIds.map((id) => (
          <div key={id} className="flex items-center gap-2 text-xs">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#1f4f4a]" />
            <span className="font-mono text-[#5d5144]">{id}</span>
          </div>
        ))}
      </div>
      {bundle.missingAddons.length > 0 && (
        <p className="text-xs text-[#a06030]">
          <span className="font-semibold">Could add:</span> {bundle.missingAddons.join(", ")}
        </p>
      )}
      <div className="flex items-center justify-between rounded-lg bg-[#e8f5f1] px-3 py-2">
        <span className="text-xs text-[#1f4f4a]">Bundle total</span>
        <span className="text-sm font-bold text-[#1f4f4a]">
          {formatMoney(bundle.total, bundle.currency)}
        </span>
      </div>
    </div>
  );
}

function ReadinessOutput({ insights }: { insights: GiftAgentInsights }) {
  const { checkoutReadiness: r } = insights;
  const color =
    r.score >= 80 ? "#1f7a55" : r.score >= 50 ? "#d97706" : "#cc2f2f";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[#756650]">Readiness score</span>
        <span className="text-base font-bold" style={{ color }}>
          {r.score}%
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#f0e4cc]">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${r.score}%`, background: color }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            r.status === "ready"
              ? "bg-[#e8f5f1] text-[#1f7a55]"
              : r.status === "needs_details"
                ? "bg-[#fff3cd] text-[#856404]"
                : "bg-[#fde8e8] text-[#842029]"
          }`}
        >
          {r.status.replace("_", " ")}
        </span>
        <span className="text-xs text-[#756650]">{r.nextAction}</span>
      </div>
      {r.missing.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-[#9b3e25]">Missing</p>
          <ul className="space-y-1">
            {r.missing.map((m) => (
              <li key={m} className="flex items-center gap-2 text-xs text-[#6b5d4c]">
                <CircleDot size={11} className="shrink-0 text-[#9b3e25]" />
                {m}
              </li>
            ))}
          </ul>
        </div>
      )}
      {r.warnings.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-[#a06030]">Warnings</p>
          <ul className="space-y-1">
            {r.warnings.map((w) => (
              <li key={w} className="flex items-start gap-2 text-xs text-[#6b5d4c]">
                <AlertTriangle size={11} className="mt-0.5 shrink-0 text-[#a06030]" />
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}
      {r.status === "ready" && (
        <div className="flex items-center gap-2 rounded-lg bg-[#e8f5f1] px-3 py-2 text-xs font-semibold text-[#1f7a55]">
          <CheckCircle2 size={14} />
          Ready to create Kapruka checkout link
        </div>
      )}
    </div>
  );
}

function SubstitutionOutput({ insights }: { insights: GiftAgentInsights }) {
  if (!insights.substitutions.length) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-[#e8f5f1] px-3 py-2 text-xs font-semibold text-[#1f7a55]">
        <CheckCircle2 size={14} />
        All products in-stock and within budget. No swaps needed.
      </div>
    );
  }

  return (
    <div className="divide-y divide-[#f0e4cc]">
      {insights.substitutions.map((sub, i) => (
        <div key={i} className="py-3 first:pt-0 last:pb-0">
          <p className="text-xs font-semibold text-[#9b3e25]">{sub.reason}</p>
          {sub.originalProductId && (
            <p className="mt-0.5 font-mono text-xs text-[#9a8878]">
              Original: {sub.originalProductId}
            </p>
          )}
          <div className="mt-2 space-y-1.5">
            {sub.alternatives.slice(0, 3).map((alt) => (
              <div
                key={alt.id}
                className="flex items-center justify-between gap-2 rounded-md bg-[#f8f2ea] px-2.5 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-[#1d1a16]">{alt.name}</p>
                  <p className="font-mono text-[10px] text-[#9a8878]">{alt.id}</p>
                </div>
                <span className="shrink-0 text-xs font-bold text-[#1f4f4a]">
                  {formatMoney(alt.price.amount, alt.price.currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MemoryOutput({ insights }: { insights: GiftAgentInsights }) {
  if (!insights.recipientMemory) {
    return (
      <p className="text-xs text-[#9a8878]">
        No recipient profile yet. Name a specific person (e.g. &quot;Amma&quot;, &quot;Nisha&quot;) in your request.
      </p>
    );
  }

  const mem = insights.recipientMemory;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[#1d1a16]">{mem.displayName}</p>
          <p className="font-mono text-xs text-[#9a8878]">{mem.recipientKey}</p>
        </div>
        <span className="rounded-full bg-[#fef3c7] px-2.5 py-0.5 text-xs font-semibold text-[#92400e]">
          remembered
        </span>
      </div>

      {mem.preferredCategories.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-[#756650]">Likes</p>
          <div className="flex flex-wrap gap-1.5">
            {mem.preferredCategories.map((c) => (
              <span key={c} className="rounded-full bg-[#fef3c7] px-2.5 py-0.5 text-xs font-medium text-[#92400e]">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {mem.occasions.filter(Boolean).length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-[#756650]">Occasions</p>
          <div className="flex flex-wrap gap-1.5">
            {mem.occasions.filter(Boolean).map((o) => (
              <span key={o} className="rounded-full bg-[#e8f5f1] px-2.5 py-0.5 text-xs font-medium text-[#1f7a55]">
                {o}
              </span>
            ))}
          </div>
        </div>
      )}

      {mem.deliveryCities.filter(Boolean).length > 0 && (
        <div className="flex items-center gap-2 text-xs text-[#756650]">
          <MapPin size={12} />
          <span>{mem.deliveryCities.filter(Boolean).join(", ")}</span>
        </div>
      )}

      {(mem.minBudget || mem.maxBudget) && (
        <div className="text-xs text-[#756650]">
          Budget:{" "}
          <span className="font-semibold text-[#1d1a16]">
            {mem.minBudget ? formatMoney(mem.minBudget) : ""}
            {mem.minBudget && mem.maxBudget ? " – " : ""}
            {mem.maxBudget ? formatMoney(mem.maxBudget) : ""}
          </span>
        </div>
      )}

      {mem.notes.filter(Boolean).length > 0 && (
        <div className="space-y-1">
          {mem.notes.filter(Boolean).map((note) => (
            <div key={note} className="flex items-start gap-1.5 text-xs text-[#756650]">
              <ChevronRight size={11} className="mt-0.5 shrink-0 text-[#85653a]" />
              {note}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AgentOutputPanel({
  agentId,
  insights,
}: {
  agentId: string;
  insights: GiftAgentInsights | null;
}) {
  if (!insights) {
    return (
      <div className="rounded-lg border border-dashed border-[#d7c5aa] bg-[#fdf8f0] p-4 text-center">
        <p className="text-sm text-[#9a8878]">No live data yet.</p>
        <p className="mt-1 text-xs text-[#b5a08a]">
          Go to{" "}
          <Link href="/" className="underline hover:text-[#85653a]">
            the chat
          </Link>{" "}
          and ask for a gift recommendation to see live agent output here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#e1cfaf] bg-[#fdf8f0] p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-[#85653a]">
        Last output
      </p>
      {agentId === "bundle" && <BundleOutput insights={insights} />}
      {agentId === "readiness" && <ReadinessOutput insights={insights} />}
      {agentId === "substitution" && <SubstitutionOutput insights={insights} />}
      {agentId === "memory" && <MemoryOutput insights={insights} />}
    </div>
  );
}

export default function AgentsDashboard() {
  const [insights, setInsights] = useState<GiftAgentInsights | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("kapruka_agent_insights");
      if (stored) {
        // eslint-disable-next-line
        setInsights(JSON.parse(stored) as GiftAgentInsights);
      }
    } catch {
      // ignore
    }
  }, []);

  const activeCount = insights
    ? [
        !!insights.bundle,
        true, // readiness always runs
        insights.substitutions.length > 0,
        !!insights.recipientMemory,
      ].filter(Boolean).length
    : 0;

  return (
    <main className="min-h-screen bg-[#f7f2e8] text-[#1d1a16]">
      {/* Header */}
      <header className="border-b border-[#ded2bd] bg-[#fffaf0]">
        <div className="mx-auto max-w-6xl px-5 py-5 sm:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex items-center gap-2 rounded-lg border border-[#eadfc9] bg-white px-3 py-2 text-sm font-medium text-[#5d5144] transition hover:border-[#1f4f4a] hover:text-[#1f4f4a]"
              >
                <ArrowLeft size={15} />
                Back to chat
              </Link>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#85653a]">
                  Kapruka Challenge Demo
                </p>
                <h1 className="text-2xl font-semibold sm:text-3xl">Agent Builder</h1>
              </div>
            </div>

            <div className="hidden items-center gap-3 sm:flex">
              {insights ? (
                <div className="flex items-center gap-2 rounded-lg border border-[#c7d8cf] bg-[#eef8f2] px-3 py-2 text-sm font-semibold text-[#1f7a55]">
                  <Zap size={15} />
                  {activeCount} / 4 active
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-[#eadfc9] bg-white px-3 py-2 text-sm text-[#9a8878]">
                  <Sparkles size={15} />
                  No live data
                </div>
              )}
            </div>
          </div>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6b5d4c]">
            These 4 agents run in parallel on every Kavi response. They analyse products, budget, delivery, and recipient history to guide the gift-buying journey from search to checkout.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        {/* Pipeline diagram */}
        <div className="mb-8 flex items-center justify-center gap-2 overflow-x-auto rounded-xl border border-[#e1cfaf] bg-white px-6 py-4 shadow-sm">
          {["Chat message", "Shopping plan", "Product search", "4 Agents run", "Reply + insights"].map(
            (step, i, arr) => (
              <div key={step} className="flex items-center gap-2">
                <div className="shrink-0 rounded-lg border border-[#eadfc9] bg-[#f8efe0] px-3 py-1.5 text-xs font-semibold text-[#5d5144]">
                  {step}
                </div>
                {i < arr.length - 1 && (
                  <ChevronRight size={14} className="shrink-0 text-[#c5ae90]" />
                )}
              </div>
            ),
          )}
        </div>

        {/* Agent cards grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {AGENT_META.map((agent) => (
            <article
              key={agent.id}
              className="overflow-hidden rounded-2xl border border-[#e1cfaf] bg-white shadow-sm"
            >
              {/* Card header */}
              <div className="border-b border-[#f0e4cc] bg-[#fffbf5] px-5 py-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${agent.bgColor} ${agent.textColor}`}
                  >
                    {agent.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-base font-semibold text-[#1d1a16]">{agent.name}</h2>
                      {insights ? (
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            (agent.id === "bundle" && insights.bundle) ||
                            agent.id === "readiness" ||
                            (agent.id === "substitution" && insights.substitutions.length > 0) ||
                            (agent.id === "memory" && insights.recipientMemory)
                              ? "bg-[#e8f5f1] text-[#1f7a55]"
                              : "bg-[#f0e4cc] text-[#85653a]"
                          }`}
                        >
                          {(agent.id === "bundle" && insights.bundle) ||
                          agent.id === "readiness" ||
                          (agent.id === "substitution" && insights.substitutions.length > 0) ||
                          (agent.id === "memory" && insights.recipientMemory)
                            ? "active"
                            : "idle"}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-[#f0e4cc] px-2 py-0.5 text-xs font-semibold text-[#85653a]">
                          standby
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-[#6b5d4c]">{agent.tagline}</p>
                  </div>
                </div>

                <div className="mt-3 rounded-lg bg-[#f0e4cc]/60 px-3 py-2 text-xs text-[#756650]">
                  <span className="font-semibold text-[#5d4025]">When: </span>
                  {agent.when}
                </div>
              </div>

              {/* Live output */}
              <div className="px-5 py-4">
                <AgentOutputPanel agentId={agent.id} insights={insights} />
                <HowItWorksToggle steps={agent.how} />
              </div>
            </article>
          ))}
        </div>

        {/* Footer CTA */}
        <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-[#e1cfaf] bg-[#fffaf0] p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#cc2f2f]/10">
            <Plus size={22} className="text-[#cc2f2f]" />
          </div>
          <h3 className="text-lg font-semibold">See agents in action</h3>
          <p className="max-w-md text-sm leading-6 text-[#6b5d4c]">
            Start a gift conversation in Kavi. Each time you ask for a recommendation, all 4 agents fire and their outputs appear live here and in the chat sidebar.
          </p>
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg bg-[#cc2f2f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#a92727]"
          >
            Open Kavi chat
            <ChevronRight size={15} />
          </Link>
        </div>
      </div>
    </main>
  );
}
