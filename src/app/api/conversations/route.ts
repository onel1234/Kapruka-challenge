import { NextResponse } from "next/server";
import { getActor, actorConversationWhere } from "@/lib/actor";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const DEFAULT_CONVERSATION_TITLE = "New gift chat";

function legacyConversationTitle(message: string) {
  const cleaned = message.replace(/\s+/g, " ").trim();
  return cleaned.length > 52 ? `${cleaned.slice(0, 52)}...` : cleaned || DEFAULT_CONVERSATION_TITLE;
}

function compactTitle(title: string) {
  const cleaned = title.replace(/\s+/g, " ").trim();
  return cleaned.length > 48 ? `${cleaned.slice(0, 45).trim()}...` : cleaned;
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}

function titleFromMessage(message?: string | null) {
  if (!message) return DEFAULT_CONVERSATION_TITLE;

  const recipientRules: Array<[RegExp, string]> = [
    [/\b(girlfriend|gf|pemwathiya|kadhali)\b|පෙම්වතිය|காதலி/iu, "girlfriend"],
    [/\b(boyfriend|bf|pemwatha|kadhalan)\b|පෙම්වතා|காதலன்/iu, "boyfriend"],
    [/\b(amma|ammata|mom|mother)\b|අම්ම|அம்மா/iu, "Amma"],
    [/\b(thaththa|thathta|dad|father|appa)\b|තාත්ත|அப்பா/iu, "Thaththa"],
    [/\b(wife|birinda|manaivi)\b|බිරිඳ|மனைவி/iu, "wife"],
    [/\b(husband|swamiya|kanavan)\b|සැමියා|கணவர்/iu, "husband"],
    [/\b(friend|yaluwa|yaluwata)\b|යාලු|நண்ப/iu, "friend"],
    [/\b(sister|akka|nangi)\b|අක්ක|නංගි|அக்கா|தங்கை/iu, "sister"],
    [/\b(brother|aiya|ayya|malli)\b|අයිය|මල්ලි|அண்ணா|தம்பி/iu, "brother"],
  ];
  const recipient = recipientRules.find(([pattern]) => pattern.test(message))?.[1] ?? null;
  const city = /\b(kandy|nuwara|mahanuwara)\b|මහනුවර|නුවර|கண்டி/iu.test(message)
    ? "Kandy"
    : /\b(colombo|kolamba|kolombo)\b|කොළඹ|கொழும்பு/iu.test(message)
      ? "Colombo"
      : /\b(galle|galla)\b|ගාල්ල|காலி/iu.test(message)
        ? "Galle"
        : null;
  const product = /flower|rose|bouquet|mal|rosa|මල්|රෝස|மலர்|பூ|ரோஜா/iu.test(message)
    ? "flowers"
    : /cake|kek|කේක්|கேக்/iu.test(message)
      ? "cake"
      : /choco|chocolate|චොක|சாக்ல/iu.test(message)
        ? "chocolates"
        : "gift";
  const occasion = /break\s*up|broke\s*up|sorry|apolog|randu|tharaha|samawa|மன்னிப்பு/iu.test(message)
    ? "Apology"
    : /birthday|bday|upandin|upandina|උපන්|பிறந்தநாள்|பிறந்த நாள்/iu.test(message)
      ? "Birthday"
      : /anniversary|සංවත්සර|திருமண நாள்/iu.test(message)
        ? "Anniversary"
        : null;

  if (/track|tracking|order status|order eka|ඕඩර්|ஆர்டர்/iu.test(message)) return "Order tracking";
  if (!/gift|present|buy|send|delivery|cake|flower|rose|choco|thagi|thegi|තෑග|ගිෆ්ට්|பரிசு|கிப்ட்/iu.test(message)) {
    if (/president|janadipathi|ජනාධිපති|ஜனாதிபதி/iu.test(message)) return "General question: president";
    return "General question";
  }

  let title = "Kapruka gift ideas";
  if (occasion === "Apology" && product === "flowers") title = recipient ? `Apology flowers for ${recipient}` : "Apology flowers";
  else if (occasion && recipient) title = `${occasion} gift for ${recipient}`;
  else if (recipient) title = `${titleCase(product)} for ${recipient}`;
  else if (occasion) title = `${occasion} ${product}`;
  else if (product !== "gift") title = titleCase(product);
  else if (city) title = `Gift delivery to ${city}`;

  if (city && !title.toLowerCase().includes(city.toLowerCase()) && title.length <= 34) title = `${title} in ${city}`;
  return compactTitle(title);
}

function displayTitle(title: string, firstUserMessage?: string | null) {
  if (!title || title === DEFAULT_CONVERSATION_TITLE || title === legacyConversationTitle(firstUserMessage ?? "")) {
    return titleFromMessage(firstUserMessage);
  }

  return title;
}

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
      messages: {
        where: { role: "user" },
        orderBy: { createdAt: "asc" },
        select: { content: true },
        take: 1,
      },
    },
    take: 50,
  });

  return NextResponse.json({
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      title: displayTitle(conversation.title, conversation.messages[0]?.content),
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
