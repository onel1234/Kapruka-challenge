import type { Metadata } from "next";
import AgentsDashboard from "./AgentsDashboard";

export const metadata: Metadata = {
  title: "Agent Builder — Kapruka Gift Concierge",
  description:
    "Inspect the 4 AI agents powering Kavi: Bundle Builder, Checkout Readiness, Substitution Agent, and Recipient Memory. See live outputs from your last conversation.",
};

export default function AgentsPage() {
  return <AgentsDashboard />;
}
