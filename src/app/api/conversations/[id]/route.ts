import { NextResponse } from "next/server";
import { getActor, getOwnedConversation } from "@/lib/actor";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await getActor();

  if (!actor) {
    return NextResponse.json({ error: "Sign in or continue as guest first." }, { status: 401 });
  }

  const { id } = await context.params;
  const ownedConversation = await getOwnedConversation(id, actor);

  if (!ownedConversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return NextResponse.json({
    conversation: {
      id: conversation?.id,
      title: conversation?.title,
      language: conversation?.language,
      cartSnapshot: conversation?.cartSnapshot,
      lastProducts: conversation?.lastProducts,
      lastDelivery: conversation?.lastDelivery,
      messages: conversation?.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
        metadata: message.metadata,
      })) ?? [],
    },
  });
}
