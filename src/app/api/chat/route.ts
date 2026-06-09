import { NextResponse } from "next/server";
import { checkDelivery, searchProducts, trackOrder } from "@/lib/kapruka";
import { callOpenRouter, extractJsonObject } from "@/lib/openrouter";
import type { ChatMessage, DetailLevel, EmojiMode, OrderTracking, Product, ResponsePreferences, ResponseTone } from "@/lib/types";
import { getActor, getOwnedConversation } from "@/lib/actor";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

type AppLanguage = "english" | "sinhala" | "tamil";

type ShoppingPlan = {
  language?: AppLanguage | "tanglish";
  search_queries?: string[];
  max_price?: number | null;
  min_price?: number | null;
  category?: string | null;
  city?: string | null;
  delivery_date?: string | null;
  occasion?: string | null;
  recipient?: string | null;
  situation?: string | null;
  emotional_tone?: "apology" | "romantic" | "celebration" | "sympathy" | "gratitude" | "practical" | null;
  suggested_addons?: string[];
};

const DEFAULT_RESPONSE_PREFERENCES: ResponsePreferences = {
  tone: "warm",
  emojiMode: "none",
  detailLevel: "balanced",
};

const QUERY_HINTS: Array<[RegExp, string[]]> = [
  [/කේක්|උපන්|උපන්දින/u, ["birthday", "cake"]],
  [/මල්|රෝස/u, ["rose", "flowers"]],
  [/චොකලට්|චොකෝ/u, ["chocolate"]],
  [/ළම|බබා/u, ["toy", "birthday"]],
  [/අම්ම|තාත්ත/u, ["birthday", "chocolate", "flowers"]],
  [/තෑග|තැග|ගිෆ්ට්/u, ["birthday", "chocolate", "flowers"]],
  [/cake|birthday|bday|උපන්|upandin/i, ["birthday", "cake"]],
  [/flower|rose|bouquet|මල්|mal/i, ["rose", "flowers"]],
  [/choco|sweet|candy|චොක/i, ["chocolate"]],
  [/hamper|basket|bundle/i, ["hamper", "chocolate"]],
  [/card|message|greeting/i, ["birthday card", "greeting card"]],
  [/perfume|fragrance/i, ["perfume"]],
  [/toy|kid|child|ළම/i, ["toy", "birthday"]],
  [/anniversary|romantic|love|wife|husband/i, ["rose", "chocolate"]],
  [/amma|mother|mom|තාත්|father|dad/i, ["birthday", "chocolate", "flowers"]],
];

function inferSituation(message: string) {
  if (/break\s*up|broke\s*up|fight|sorry|apolog|make it up|forgive/i.test(message)) {
    return {
      situation: "relationship repair",
      emotional_tone: "apology" as const,
      search_queries: ["rose bouquet", "flowers", "sorry card"],
      suggested_addons: ["a handwritten note card", "chocolates"],
    };
  }

  if (/anniversary|romantic|love|wife|girlfriend|boyfriend|husband/i.test(message)) {
    return {
      situation: "romantic gift",
      emotional_tone: "romantic" as const,
      search_queries: ["rose bouquet", "chocolate", "romantic gift"],
      suggested_addons: ["a note card"],
    };
  }

  if (/sympathy|condolence|funeral|loss|passed away/i.test(message)) {
    return {
      situation: "sympathy gesture",
      emotional_tone: "sympathy" as const,
      search_queries: ["flowers", "white flowers"],
      suggested_addons: ["a simple message card"],
    };
  }

  if (/thank|thanks|appreciat/i.test(message)) {
    return {
      situation: "thank you gift",
      emotional_tone: "gratitude" as const,
      search_queries: ["thank you gift", "flowers", "chocolate"],
      suggested_addons: ["a thank-you note"],
    };
  }

  return {
    situation: null,
    emotional_tone: null,
    search_queries: [] as string[],
    suggested_addons: [] as string[],
  };
}

function fallbackPlan(message: string): ShoppingPlan {
  const searchQueries = new Set<string>();
  const situation = inferSituation(message);
  situation.search_queries.forEach((query) => searchQueries.add(query));

  for (const [pattern, queries] of QUERY_HINTS) {
    if (pattern.test(message)) {
      queries.forEach((query) => searchQueries.add(query));
    }
  }

  const budgetMatch =
    message.match(/(?:rs\.?|lkr|රු\.?|රුපියල්)\s*([\d,]+)/i) ??
    message.match(/(?:under|below|අඩු|යටතේ)\s*(?:rs\.?|lkr|රු\.?|රුපියල්)?\s*([\d,]+)/i) ??
    message.match(/([\d,]+)\s*(?:ට)?\s*(?:අඩු|යටතේ|අඩුවෙන්)/i);
  const cityMatch = message.match(/\b(colombo\s?\d{0,2}|kandy|galle|jaffna|negombo|matara|kurunegala|anuradhapura)\b/i);
  const sinhalaCity =
    /මහනුවර|නුවර/.test(message)
      ? "Kandy"
      : /කොළඹ/.test(message)
        ? "Colombo"
        : /ගාල්ල/.test(message)
          ? "Galle"
          : /යාපනය/.test(message)
            ? "Jaffna"
            : null;

  if (searchQueries.size === 0) {
    searchQueries.add("birthday");
    searchQueries.add("chocolate");
  }

  return {
    search_queries: Array.from(searchQueries).slice(0, 3),
    max_price: budgetMatch ? Number(budgetMatch[1].replace(/,/g, "")) : null,
    city: cityMatch?.[1] ?? sinhalaCity,
    language: /[\u0D80-\u0DFF]/.test(message) ? "sinhala" : "english",
    situation: situation.situation,
    emotional_tone: situation.emotional_tone,
    suggested_addons: situation.suggested_addons,
  };
}

function normalizeLanguage(language: unknown): AppLanguage | null {
  return language === "english" || language === "sinhala" || language === "tamil" ? language : null;
}

function detectMessageLanguage(message: string): AppLanguage | null {
  if (/[\u0D80-\u0DFF]/.test(message)) return "sinhala";
  if (/[\u0B80-\u0BFF]/.test(message)) return "tamil";
  return null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function normalizeResponsePreferences(value: unknown): ResponsePreferences {
  const candidate = value && typeof value === "object" ? (value as Partial<ResponsePreferences>) : {};

  return {
    tone: oneOf<ResponseTone>(candidate.tone, ["warm", "professional", "playful", "concise"], DEFAULT_RESPONSE_PREFERENCES.tone),
    emojiMode: oneOf<EmojiMode>(candidate.emojiMode, ["none", "light", "expressive"], DEFAULT_RESPONSE_PREFERENCES.emojiMode),
    detailLevel: oneOf<DetailLevel>(
      candidate.detailLevel,
      ["short", "balanced", "detailed"],
      DEFAULT_RESPONSE_PREFERENCES.detailLevel,
    ),
  };
}

function languageInstruction(language: ShoppingPlan["language"]) {
  if ((language as string | null) === "sinhala") {
    return "Reply in natural Sinhala using Sinhala script. Product names, product IDs, brand names, prices, and URLs may remain exactly as provided.";
  }

  if ((language as string | null) === "tamil") {
    return "Reply in natural Tamil using Tamil script. Product names, product IDs, brand names, prices, and URLs may remain exactly as provided.";
  }

  if (language === "tanglish") {
    return "Reply in friendly Sinhala-English transliteration only if the user used transliterated Sinhala.";
  }

  return "Reply in English.";
}

function responseStyleInstruction(preferences: ResponsePreferences) {
  const tone = {
    warm: "warm, helpful, Sri Lankan concierge tone",
    professional: "professional, polished, and direct",
    playful: "playful, cheerful, and light",
    concise: "concise, practical, and low-fluff",
  }[preferences.tone];
  const emoji = {
    none: "Do not use emojis.",
    light: "Use at most one relevant emoji if it feels natural.",
    expressive: "Use a few relevant emojis, but keep the message readable.",
  }[preferences.emojiMode];
  const length = {
    short: "Keep it under 70 words.",
    balanced: "Keep it under 130 words.",
    detailed: "Use up to 190 words when needed.",
  }[preferences.detailLevel];

  return `Tone: ${tone}. ${emoji} ${length}`;
}

function conciergeMove(plan: ShoppingPlan) {
  if (plan.emotional_tone === "apology") {
    return "Acknowledge the situation gently. Have a point of view: flowers alone can feel generic, so suggest pairing the flowers with a sincere note card and optionally chocolates. Do not overpromise reconciliation.";
  }

  if (plan.emotional_tone === "romantic") {
    return "Frame the recommendation as a romantic gesture, not just products. Mention why the top pick feels right and suggest a small note card.";
  }

  if (plan.emotional_tone === "sympathy") {
    return "Keep the tone calm and respectful. Avoid cheeriness. Suggest understated flowers and a simple message card.";
  }

  if (plan.emotional_tone === "gratitude") {
    return "Make the response feel appreciative and practical. Suggest a small note that says exactly what they are thanking the person for.";
  }

  return "Be a helpful concierge: briefly interpret the situation, make one recommendation, and give the user a clear next step.";
}

function conversationTitle(message: string) {
  const cleaned = message.replace(/\s+/g, " ").trim();
  return cleaned.length > 52 ? `${cleaned.slice(0, 52)}...` : cleaned || "New gift chat";
}

function hasTrackingIntent(message: string) {
  return /\b(track|tracking|status|where.*order|order status|order number)\b/i.test(message);
}

function extractTrackingOrderNumber(message: string) {
  if (!hasTrackingIntent(message)) return null;
  const candidates = message.match(/[a-z0-9][a-z0-9-]{3,39}/gi) ?? [];
  return candidates.find((candidate) => /\d/.test(candidate) && /[a-z]/i.test(candidate))?.toUpperCase() ?? null;
}

function buildTrackingReply(tracking: OrderTracking) {
  const status = tracking.status_display ?? tracking.status ?? "Status unavailable";
  const orderNumber = tracking.order_number ?? "the order";
  const deliveryDate = tracking.delivery_date ? ` Delivery date: ${tracking.delivery_date}.` : "";
  const shippedDate = tracking.shipped_date ? ` Shipped: ${tracking.shipped_date}.` : "";
  const recipientCity = tracking.recipient?.city ? ` Recipient city: ${tracking.recipient.city}.` : "";
  const latestProgress = tracking.progress?.length ? tracking.progress[tracking.progress.length - 1] : null;
  const progress = latestProgress?.step
    ? ` Latest update: ${latestProgress.step}${latestProgress.timestamp ? ` at ${latestProgress.timestamp}` : ""}.`
    : "";

  return `Tracking update for ${orderNumber}: ${status}.${deliveryDate}${shippedDate}${recipientCity}${progress}`;
}

function hasShoppingIntent(message: string) {
  const englishIntent =
    /\b(gift|present|buy|send|shop|shopping|find|recommend|suggest|search|order|checkout|cart|deliver|delivery|kapruka|product|item|price|budget|under|rs\.?|lkr|cake|birthday|bday|flower|rose|bouquet|chocolate|choco|hamper|basket|card|perfume|toy|anniversary|romantic|wife|husband|mother|mom|amma|father|dad|sister|brother|friend|teacher|boss|colombo|kandy|galle|jaffna|negombo|matara|kurunegala|anuradhapura|today|tomorrow)\b/i.test(message);
  const sinhalaIntent =
    /තෑග|තැග|ගිෆ්ට්|අම්ම|තාත්ත|අක්ක|නංගි|අයිය|මල්|රෝස|කේක්|චොකලට්|හැම්පර්|උපන්|උපන්දින|සංවත්සර|රුපියල්|රු\.?|අඩු|අඩුවෙන්|යටතේ|මිල|බජට්|යව|එව|බෙදා|කොළඹ|මහනුවර|නුවර|ගාල්ල|යාපනය|මීගමුව|මාතර|කුරුණෑගල|අනුරාධපුර|ඕන|ඔන|හොය|සොය/u.test(message);

  return englishIntent || sinhalaIntent;
}

function buildOutOfScopeReply(language: AppLanguage | null, preferences: ResponsePreferences) {
  const emoji = preferences.emojiMode === "none" ? "" : " 🎁";

  if ((language as AppLanguage | null) === "sinhala") {
    return `මම Kapruka තෑගි සෙවීම, delivery check කිරීම, checkout link සෑදීම, සහ paid order tracking සඳහායි. තෑග්ග කාටද, අවස්ථාව, budget එක, delivery city එක කියන්න; මම හොඳ විකල්ප සොයලා දෙන්නම්.${emoji}`;
  }

  if ((language as AppLanguage | null) === "tamil") {
    return `நான் Kapruka பரிசு தேடல், delivery check, checkout link உருவாக்குதல், paid order tracking ஆகியவற்றுக்காக இருக்கிறேன். பரிசு யாருக்காக, நிகழ்வு, budget, delivery city சொல்லுங்கள்; பொருத்தமான விருப்பங்களைத் தேடித் தருகிறேன்.${emoji}`;
  }
  if ((language as ShoppingPlan["language"]) === "sinhala") {
    return "මම Kapruka තෑගි සෙවීම, delivery check කිරීම, checkout link සෑදීම, සහ paid order tracking සඳහායි. තෑග්ග කාටද, අවස්ථාව, budget එක, delivery city එක කියන්න; මම හොඳ විකල්ප සොයලා දෙන්නම්.";
  }

  if ((language as ShoppingPlan["language"]) === "tamil") {
    return "நான் Kapruka பரிசு தேடல், delivery check, checkout link உருவாக்குதல், paid order tracking ஆகியவற்றுக்காக இருக்கிறேன். பரிசு யாருக்காக, நிகழ்வு, budget, delivery city சொல்லுங்கள்; பொருத்தமான விருப்பங்களைத் தேடித் தருகிறேன்.";
  }

  return `I am Kavi, your Kapruka gift concierge. I can help with gift ideas, product search, delivery checks, checkout links, and paid order tracking. Tell me who the gift is for, the occasion, budget, and delivery city.${emoji}`;
}

async function resolveConversation(params: {
  conversationId?: string | null;
  actor: Awaited<ReturnType<typeof getActor>>;
  language: AppLanguage | null;
  firstMessage: string;
}) {
  if (!params.actor) return null;

  if (params.conversationId) {
    const conversation = await getOwnedConversation(params.conversationId, params.actor);
    if (conversation) return conversation;
  }

  return prisma.conversation.create({
    data: {
      title: conversationTitle(params.firstMessage),
      language: params.language ?? "english",
      ...(params.actor.type === "user" ? { userId: params.actor.userId } : { guestSessionId: params.actor.guestSessionId }),
    },
  });
}

async function createShoppingPlan(message: string, history: ChatMessage[], replyLanguage: AppLanguage | null) {
  const fallback = fallbackPlan(message);
  const forcedLanguage = replyLanguage ?? detectMessageLanguage(message) ?? fallback.language;
  const recentHistory = history
    .slice(-6)
    .map((item) => `${item.role}: ${item.content}`)
    .join("\n");

  try {
    const text = await callOpenRouter(
      [
        {
          role: "system",
          content:
            "You are planning tool use for a Sri Lankan Kapruka shopping concierge. Return only compact JSON. Read the human situation, not just keywords. Convert vague requests into specific Kapruka search terms. Prefer terms like birthday, chocolate, rose, flowers, hamper, greeting card, perfume, toy, cake. Extract LKR budgets, delivery city, ISO delivery date if present, occasion, recipient, situation, emotional_tone, and useful add-ons. Do not include commentary.",
        },
        {
          role: "user",
          content: JSON.stringify({
            today: new Date().toISOString().slice(0, 10),
            latest_user_message: message,
            recent_history: recentHistory,
            output_shape: {
              language: "english | sinhala | tanglish",
              search_queries: ["specific catalog search terms"],
              max_price: "number or null",
              min_price: "number or null",
              category: "string or null",
              city: "string or null",
              delivery_date: "YYYY-MM-DD or null",
              occasion: "string or null",
              recipient: "string or null",
              situation: "string or null",
              emotional_tone: "apology | romantic | celebration | sympathy | gratitude | practical | null",
              suggested_addons: ["small helpful add-ons such as note card or chocolates"],
            },
            selected_reply_language: forcedLanguage,
          }),
        },
      ],
      500,
    );

    const parsed = extractJsonObject<ShoppingPlan>(text);
    const combinedQueries = [
      ...(parsed?.search_queries ?? []),
      ...(fallback.search_queries ?? []),
    ]
      .map((query) => query.trim())
      .filter((query) => query.length >= 3);

    return {
      ...fallback,
      ...parsed,
      language: forcedLanguage ?? parsed?.language ?? fallback.language,
      search_queries: Array.from(new Set(combinedQueries)).slice(0, 4),
    };
  } catch {
    return {
      ...fallback,
      language: forcedLanguage,
    };
  }
}

function uniqueProducts(products: Product[]) {
  const seen = new Set<string>();
  return products.filter((product) => {
    if (seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  });
}

function productBrief(products: Product[]) {
  return products.slice(0, 8).map((product) => ({
    id: product.id,
    name: product.name,
    price: `${product.price?.currency ?? "LKR"} ${product.price?.amount ?? "?"}`,
    in_stock: product.in_stock,
    category: product.category?.name,
    summary: product.summary?.slice(0, 240),
  }));
}

function summarizeDelivery(delivery: unknown, language: ShoppingPlan["language"]) {
  if (!delivery || typeof delivery !== "object") {
    return null;
  }

  const deliveryObject = delivery as {
    available?: boolean;
    reason?: string;
    next_available_date?: string;
    rate?: number;
    currency?: string;
  };

  if ((language as ShoppingPlan["language"]) === "sinhala") {
    if (deliveryObject.available) {
      return `බෙදාහැරීම ලබා ගත හැක. ගාස්තුව: ${deliveryObject.currency ?? "LKR"} ${deliveryObject.rate ?? "TBC"}.`;
    }

    if (deliveryObject.next_available_date) {
      return `ලබා ගත හැකි ඊළඟ බෙදාහැරීමේ දිනය: ${deliveryObject.next_available_date}.`;
    }

    return deliveryObject.reason ? "තෝරාගත් දිනය සඳහා බෙදාහැරීමේ සටහනක් තිබේ." : null;
  }

  if ((language as ShoppingPlan["language"]) === "tamil") {
    if (deliveryObject.available) {
      return `விநியோகம் கிடைக்கும். கட்டணம்: ${deliveryObject.currency ?? "LKR"} ${deliveryObject.rate ?? "TBC"}.`;
    }

    if (deliveryObject.next_available_date) {
      return `அடுத்த கிடைக்கும் விநியோக தேதி: ${deliveryObject.next_available_date}.`;
    }

    return deliveryObject.reason ? "தேர்ந்தெடுத்த தேதிக்கான விநியோக குறிப்பு உள்ளது." : null;
  }

  if ((language as ShoppingPlan["language"]) === "sinhala") {
    if (deliveryObject.available) {
      return `බෙදාහැරීම ලබා ගත හැක. ගාස්තුව: ${deliveryObject.currency ?? "LKR"} ${deliveryObject.rate ?? "TBC"}.`;
    }

    if (deliveryObject.next_available_date) {
      return `ලබා ගත හැකි ඊළඟ බෙදාහැරීමේ දිනය: ${deliveryObject.next_available_date}.`;
    }

    return deliveryObject.reason ? "තෝරාගත් දිනය සඳහා බෙදාහැරීමේ සටහනක් තිබේ." : null;
  }

  if ((language as ShoppingPlan["language"]) === "tamil") {
    if (deliveryObject.available) {
      return `விநியோகம் கிடைக்கும். கட்டணம்: ${deliveryObject.currency ?? "LKR"} ${deliveryObject.rate ?? "TBC"}.`;
    }

    if (deliveryObject.next_available_date) {
      return `அடுத்த கிடைக்கும் விநியோக தேதி: ${deliveryObject.next_available_date}.`;
    }

    return deliveryObject.reason ? "தேர்ந்தெடுத்த தேதிக்கான விநியோக குறிப்பு உள்ளது." : null;
  }

  if (typeof deliveryObject.reason === "string") {
    return deliveryObject.reason;
  }

  if (deliveryObject.available) {
    return `Delivery is available. Fee: ${deliveryObject.currency ?? "LKR"} ${deliveryObject.rate ?? "TBC"}.`;
  }

  if (deliveryObject.next_available_date) {
    return `Next available delivery date: ${deliveryObject.next_available_date}.`;
  }

  return null;
}

function buildGroundedReply(params: {
  products: Product[];
  plan: ShoppingPlan;
  delivery: unknown;
  queries: string[];
  preferences: ResponsePreferences;
}) {
  const { products, plan, delivery, queries, preferences } = params;
  const deliveryLine = summarizeDelivery(delivery, plan.language);
  const language = plan.language ?? "english";
  const emoji = preferences.emojiMode === "none" ? "" : " 🎁";

  if (!products.length) {
    const searchedFor = queries.join(", ");

    if ((language as ShoppingPlan["language"]) === "sinhala" || (language as ShoppingPlan["language"]) === "tanglish") {
      return `"${searchedFor}" සඳහා Kapruka හි හොඳ in-stock ගැළපීමක් තවම හමු වුණේ නැහැ. අවස්ථාව, ලබන්නා, budget එක, සහ delivery city එක කියන්න; මම තවත් නිවැරදි සෙවීමක් කරලා දෙන්නම්.${emoji}`;
    }

    if ((language as ShoppingPlan["language"]) === "tamil") {
      return `"${searchedFor}" என்பதற்கு Kapruka-வில் நல்ல in-stock பொருத்தம் இன்னும் கிடைக்கவில்லை. நிகழ்வு, பெறுபவர், budget, delivery city சொல்லுங்கள்; இன்னும் துல்லியமாக தேடுகிறேன்.${emoji}`;
    }

    if (language === "sinhala" || language === "tanglish") {
      return `"${searchedFor}" සඳහා Kapruka හි හොඳ තොගයේ ඇති ගැළපීමක් හමු වුණේ නැහැ. අවස්ථාව, ලබන්නා, අයවැය සහ බෙදාහැරීමේ නගරය කියන්න; මම තව නිවැරදි සෙවීමක් කරන්නම්.`;
    }

    if (language === "tamil") {
      return `"${searchedFor}" என்பதற்கு Kapruka-வில் வலுவான கையிருப்பு பொருத்தம் கிடைக்கவில்லை. நிகழ்வு, பெறுபவர், செலவு வரம்பு, விநியோக நகரம் ஆகியவற்றை சொல்லுங்கள்; இன்னும் துல்லியமாக தேடுகிறேன்.`;
    }

    return `I searched Kapruka for ${searchedFor}, but did not find a strong in-stock match yet. Tell me the occasion, recipient, budget, and delivery city, and I will try a sharper search.`;
  }

  const picks = products.slice(0, 4);
  const productLines = picks
    .map((product, index) => `${index + 1}. ${product.name} - ${product.price.currency} ${product.price.amount}`)
    .join("\n");
  const deliveryText = deliveryLine ? `\n\nDelivery note: ${deliveryLine}` : "";
  const addonText = plan.suggested_addons?.length ? `\n\nUseful add-ons: ${plan.suggested_addons.join(", ")}.` : "";
  const situationText = plan.situation ? `\n\nSituation: ${plan.situation}.` : "";
  const conciergeText = `\n\nConcierge angle: ${conciergeMove(plan)}`;

  if (language === "sinhala" || language === "tanglish") {
    const sinhalaDeliveryText = deliveryLine ? `\n\nබෙදාහැරීම: ${deliveryLine}` : "";
    return `ඔබේ ඉල්ලීමට ගැළපෙන Kapruka තේරීම් කිහිපයක් හමු වුණා${emoji}\n\n${productLines}${sinhalaDeliveryText}${addonText}${situationText}${conciergeText}\n\nමගේ පළමු යෝජනාව: ${picks[0].name}. මෙයින් එකක් හෝ කිහිපයක් කරත්තයට එකතු කරමුද?`;
  }

  if (language === "tamil") {
    const tamilDeliveryText = deliveryLine ? `\n\nவிநியோகம்: ${deliveryLine}` : "";
    return `உங்கள் கோரிக்கைக்கு பொருத்தமான Kapruka தேர்வுகள் கிடைத்தன${emoji}\n\n${productLines}${tamilDeliveryText}${addonText}${situationText}${conciergeText}\n\nஎன் முதல் பரிந்துரை: ${picks[0].name}. இதில் ஒன்றையோ சிலவற்றையோ வண்டியில் சேர்க்கலாமா?`;
  }

  return `I found some real Kapruka options that fit the request${emoji}\n\n${productLines}${deliveryText}${addonText}${situationText}${conciergeText}\n\nMy first pick is ${picks[0].name}. Add one or two to the cart and I will help you turn it into a complete gift.`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      message?: string;
      history?: ChatMessage[];
      language?: AppLanguage;
      conversationId?: string | null;
      cartSnapshot?: unknown;
      responsePreferences?: unknown;
    };
    const message = body.message?.trim();

    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const actor = await getActor();

    if (!actor) {
      return NextResponse.json({ error: "Sign in or continue as guest first." }, { status: 401 });
    }

    const history = body.history ?? [];
    const selectedLanguage = normalizeLanguage(body.language);
    const replyLanguage = detectMessageLanguage(message) ?? selectedLanguage;
    const responsePreferences = normalizeResponsePreferences(body.responsePreferences);
    const conversation = await resolveConversation({
      conversationId: body.conversationId ?? null,
      actor,
      language: replyLanguage,
      firstMessage: message,
    });

    if (!conversation) {
      return NextResponse.json({ error: "Could not create conversation." }, { status: 500 });
    }

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: message,
      },
    });

    const trackingOrderNumber = extractTrackingOrderNumber(message);

    if (trackingOrderNumber) {
      const reply = trackingOrderNumber.startsWith("ORD-")
        ? "That looks like the checkout reference from the pay link. To track delivery, use the Kapruka order number from the paid order confirmation email or order complete page."
        : await trackOrder(trackingOrderNumber)
            .then((tracking) =>
              typeof tracking === "string"
                ? tracking.replace(/^Error:\s*/i, "").trim() || "I could not find tracking for that order number."
                : buildTrackingReply(tracking as OrderTracking),
            )
            .catch((error) => (error instanceof Error ? error.message : "Order tracking failed."));

      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "assistant",
          content: reply,
          metadata: {
            order_tracking: {
              order_number: trackingOrderNumber,
            },
          },
        },
      });

      return NextResponse.json({
        reply,
        products: [],
        delivery: null,
        plan: { language: replyLanguage ?? "english" },
        conversationId: conversation.id,
      });
    }

    if (hasTrackingIntent(message)) {
      const reply =
        "Please send the Kapruka order number from your paid order confirmation email or order complete page. It is different from the checkout ref shown before payment.";

      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "assistant",
          content: reply,
          metadata: {
            order_tracking: {
              missing_order_number: true,
            },
          },
        },
      });

      return NextResponse.json({
        reply,
        products: [],
        delivery: null,
        plan: { language: replyLanguage ?? "english" },
        conversationId: conversation.id,
      });
    }

    if (!hasShoppingIntent(message)) {
      const reply = buildOutOfScopeReply(replyLanguage, responsePreferences);

      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "assistant",
          content: reply,
          metadata: {
            out_of_scope: true,
          },
        },
      });

      return NextResponse.json({
        reply,
        products: [],
        delivery: null,
        plan: { language: replyLanguage ?? "english" },
        conversationId: conversation.id,
      });
    }

    const plan = await createShoppingPlan(message, history, replyLanguage);
    const fallback = fallbackPlan(message);
    const queries = plan.search_queries?.length ? plan.search_queries : (fallback.search_queries ?? ["birthday"]);

    const searchResponses = await Promise.all(
      queries.slice(0, 3).map((query) =>
        searchProducts({
          q: query,
          limit: 8,
          min_price: plan.min_price ?? null,
          max_price: plan.max_price ?? null,
          category: null,
        }).catch(() => ({ results: [] })),
      ),
    );

    let products = uniqueProducts(searchResponses.flatMap((response) => response.results ?? [])).slice(0, 12);

    if (!products.length && plan.max_price) {
      const retryResponses = await Promise.all(
        queries.slice(0, 3).map((query) =>
          searchProducts({
            q: query,
            limit: 4,
            min_price: plan.min_price ?? null,
            max_price: null,
            category: null,
          }).catch(() => ({ results: [] })),
        ),
      );
      products = uniqueProducts(retryResponses.flatMap((response) => response.results ?? [])).slice(0, 8);
    }
    const delivery =
      plan.city && plan.city.trim().length > 1
        ? await checkDelivery({
            city: plan.city,
            delivery_date: plan.delivery_date ?? null,
            product_id: products[0]?.id ?? null,
          }).catch((error) => ({ error: String(error) }))
        : null;

    const groundedReply = buildGroundedReply({ products, plan, delivery, queries, preferences: responsePreferences });
    const reply = products.length
      ? await callOpenRouter(
          [
            {
              role: "system",
              content: `Rewrite the grounded response as a human Kapruka concierge, not a search-results bot. ${languageInstruction(plan.language ?? replyLanguage ?? "english")} ${responseStyleInstruction(responsePreferences)} ${conciergeMove(plan)} Start by acknowledging the user's situation in one natural sentence. Then give 3-4 grounded product options and one clear recommendation. Suggest a thoughtful next step, such as adding a note card, chocolates, or checking delivery, only if supported by the grounded response. Keep every product name and price exactly as provided. Do not add any product, price, checkout link, table, markdown link, or claim that is not in the grounded response.`,
            },
            {
              role: "user",
              content: JSON.stringify({
                grounded_response: groundedReply,
                allowed_products: productBrief(products),
              }),
            },
          ],
          450,
        ).catch(() => groundedReply)
          .then((candidate) => (candidate.includes(products[0].name) ? candidate : groundedReply))
      : groundedReply;

    const deliveryPayload = delivery ? { city: plan.city, delivery_date: plan.delivery_date ?? null, raw: delivery } : null;

    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "assistant",
          content: reply,
          metadata: {
            plan,
            products,
            delivery: deliveryPayload,
          },
        },
      }),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          language: plan.language ?? replyLanguage ?? "english",
          cartSnapshot: body.cartSnapshot ?? undefined,
          lastProducts: products,
          lastDelivery: deliveryPayload ?? undefined,
        },
      }),
    ]);

    return NextResponse.json({
      reply,
      products,
      delivery: deliveryPayload,
      plan,
      conversationId: conversation.id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Something went wrong.",
      },
      { status: 500 },
    );
  }
}
