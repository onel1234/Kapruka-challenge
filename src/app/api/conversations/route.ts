import { NextResponse } from "next/server";
import { getActor, actorConversationWhere } from "@/lib/actor";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const actor = await getActor();

  if (!actor) {
    return NextResponse.json({ error: "Sign in or continue as guest first." }, { status: 401 });
  }

  const conversations = await prisma.conversation.findMany({
    where: actorConversationWhere(actor),
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      language: true,
      updatedAt: true,
      createdAt: true,
      _count: { select: { messages: true } },
    },
    take: 50,
  });

  return NextResponse.json({
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      language: conversation.language,
      updatedAt: conversation.updatedAt.toISOString(),
      createdAt: conversation.createdAt.toISOString(),
      messageCount: conversation._count.messages,
    })),
  });
}

export async function POST(request: Request) {
  const actor = await getActor();

  if (!actor) {
    return NextResponse.json({ error: "Sign in or continue as guest first." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const language = typeof body.language === "string" ? body.language : "english";

  const conversation = await prisma.conversation.create({
    data: {
      title: "New gift chat",
      language,
      ...(actor.type === "user" ? { userId: actor.userId } : { guestSessionId: actor.guestSessionId }),
    },
    select: {
      id: true,
      title: true,
      language: true,
      updatedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    conversation: {
      ...conversation,
      updatedAt: conversation.updatedAt.toISOString(),
      createdAt: conversation.createdAt.toISOString(),
      messages: [],
    },
  });
}
