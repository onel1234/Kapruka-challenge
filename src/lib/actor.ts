import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getValidGuestSession } from "@/lib/guest";
import { prisma } from "@/lib/db";

export type Actor =
  | { type: "user"; userId: string; guestSessionId?: null }
  | { type: "guest"; guestSessionId: string; userId?: null };

export async function getActor(): Promise<Actor | null> {
  const session = await getServerSession(authOptions);

  if (session?.user?.id) {
    return { type: "user", userId: session.user.id };
  }

  const guestSession = await getValidGuestSession();

  if (guestSession) {
    return { type: "guest", guestSessionId: guestSession.id };
  }

  return null;
}

export function actorConversationWhere(actor: Actor) {
  return actor.type === "user"
    ? { userId: actor.userId }
    : { guestSessionId: actor.guestSessionId };
}

export async function getOwnedConversation(conversationId: string, actor: Actor) {
  return prisma.conversation.findFirst({
    where: {
      id: conversationId,
      ...actorConversationWhere(actor),
    },
  });
}

export async function migrateGuestToUser(guestSessionId: string, userId: string) {
  await prisma.$transaction([
    prisma.conversation.updateMany({
      where: { guestSessionId, userId: null },
      data: { userId, guestSessionId: null },
    }),
    prisma.checkoutRecord.updateMany({
      where: { guestSessionId, userId: null },
      data: { userId, guestSessionId: null },
    }),
    prisma.guestSession.update({
      where: { id: guestSessionId },
      data: {
        migratedToUserId: userId,
        migratedAt: new Date(),
      },
    }),
  ]);
}
