import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import LandingAuth from "@/components/LandingAuth";
import { authOptions } from "@/lib/auth";

export default async function LandingPage() {
  const session = await getServerSession(authOptions).catch(() => null);

  if (session?.user?.id) {
    redirect("/chat");
  }

  return <LandingAuth />;
}
