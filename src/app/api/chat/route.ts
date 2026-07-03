import { NextResponse } from "next/server";
import { checkDelivery, searchProducts, trackOrder } from "@/lib/kapruka";
import { buildGiftAgentInsights } from "@/lib/gift-agents";
import { callOpenRouter, extractJsonObject } from "@/lib/openrouter";
import type { ChatMessage, DetailLevel, EmojiMode, GiftAgentInsights, OrderTracking, Product, ResponsePreferences, ResponseTone } from "@/lib/types";
import { getActor, getOwnedConversation } from "@/lib/actor";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

type AppLanguage = "english" | "sinhala" | "singlish" | "tamil" | "tanglish";

type ShoppingPlan = {
  language?: AppLanguage;
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
  // Checkout fields extracted from conversation
  recipient_name?: string | null;
  recipient_phone?: string | null;
  sender_name?: string | null;
  delivery_address?: string | null;
  gift_message?: string | null;
  delivery_instructions?: string | null;
};

const DEFAULT_RESPONSE_PREFERENCES: ResponsePreferences = {
  tone: "playful",
  emojiMode: "expressive",
  detailLevel: "balanced",
};

const QUERY_HINTS: Array<[RegExp, string[]]> = [
  [/கேக்|பிறந்தநாள்|பிறந்த நாள்/u, ["birthday", "cake"]],
  [/மலர்|பூ|ரோஜா/u, ["rose", "flowers"]],
  [/சாக்லேட்|சாக்லட்/u, ["chocolate"]],
  [/அம்மா|அப்பா/u, ["birthday", "chocolate", "flowers"]],
  [/பரிசு|கிப்ட்/u, ["birthday", "chocolate", "flowers"]],
  [/காதல்|மனைவி|கணவர்/u, ["rose", "chocolate"]],
  [/\b(pirandha|pirantha|birthday|bday|cake|kek)\b/i, ["birthday", "cake"]],
  [/\b(pookal|poo|malar|roja|rose|flower|bouquet)\b/i, ["rose", "flowers"]],
  [/\b(chocolate|choco|saaklet|sweet)\b/i, ["chocolate"]],
  [/\b(parisu|giftu|gift|present)\b/i, ["birthday", "chocolate", "flowers"]],
  [/\b(amma|appa|annai|thambi|thangachi|akka|anna)\b/i, ["birthday", "chocolate", "flowers"]],
  [/\b(kadhal|kadhali|kadhalan|manaivi|kanavan)\b/i, ["rose", "chocolate"]],
  [/කේක්|උපන්|උපන්දින/u, ["birthday", "cake"]],
  [/මල්|රෝස/u, ["rose", "flowers"]],
  [/චොකලට්|චොකෝ/u, ["chocolate"]],
  [/ළම|බබා/u, ["toy", "birthday"]],
  [/අම්ම|තාත්ත/u, ["birthday", "chocolate", "flowers"]],
  [/තෑග|තැග|ගිෆ්ට්/u, ["birthday", "chocolate", "flowers"]],
  [/\b(upandin|upandina|birthday|bday|cake|kek)\b/i, ["birthday", "cake"]],
  [/\b(mal|rosa|rose|flower|bouquet|mal\s*pokura)\b/i, ["rose", "flowers"]],
  [/\b(choco|chocolate|sweets?|chokalat)\b/i, ["chocolate"]],
  [/\b(thagi|thegi|thaagi|taggak|gift\s*ekak|present\s*ekak)\b/i, ["birthday", "chocolate", "flowers"]],
  [/\b(amma|ammata|thaththa|thathta|akk[a]?|nangi|aiya|ayya|malli|yaluwa|yaluwata)\b/i, [
    "birthday",
    "chocolate",
    "flowers",
  ]],
  [/\b(lama|lamai|baba|podda|podi)\b/i, ["toy", "birthday"]],
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
  if (
    /break\s*up|broke\s*up|fight|sorry|apolog|make it up|forgive|randu|tharaha|samawa|sorry\s*kiyanna|dala\s*giya|pirinuna|pirinju|pirinjitten|sandai|mannippu|samadanam|மன்னிப்பு|சண்டை|பிரிவு/iu.test(
      message,
    )
  ) {
    return {
      situation: "relationship repair",
      emotional_tone: "apology" as const,
      search_queries: ["rose bouquet", "flowers", "sorry card"],
      suggested_addons: ["a handwritten note card", "chocolates"],
    };
  }

  if (
    /anniversary|romantic|love|wife|girlfriend|boyfriend|husband|adare|aadare|pemwathiya|pemwatha|birinda|swamiya|kadhal|kadhali|kadhalan|manaivi|kanavan|காதல்|காதலி|காதலன்|மனைவி|கணவர்/iu.test(
      message,
    )
  ) {
    return {
      situation: "romantic gift",
      emotional_tone: "romantic" as const,
      search_queries: ["rose bouquet", "chocolate", "romantic gift"],
      suggested_addons: ["a note card"],
    };
  }

  if (/sympathy|condolence|funeral|loss|passed away|maranaya|nathi\s*wuna|anuthabam|அனுதாபம்|இறப்பு/iu.test(message)) {
    return {
      situation: "sympathy gesture",
      emotional_tone: "sympathy" as const,
      search_queries: ["flowers", "white flowers"],
      suggested_addons: ["a simple message card"],
    };
  }

  if (/thank|thanks|appreciat|sthuthi|istuti|bohoma\s*sthuthi|nandri|நன்றி/iu.test(message)) {
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
  const singlishBudgetMatch =
    message.match(/(?:rs\.?|lkr|rupiyal|rupees?)\s*([\d,]+)/i) ??
    message.match(
      /(?:under|below|less than|aduwen|yata|yatin|athule|watina|wage)\s*(?:rs\.?|lkr|rupiyal|rupees?)?\s*([\d,]+)/i,
    ) ??
    message.match(/([\d,]+)\s*(?:ta|kata)?\s*(?:aduwen|yata|yatin|athule|wage)/i);
  const tamilBudgetMatch =
    message.match(/(?:rs\.?|lkr|ரூ\.?|ரூபாய்|rooba|rupa|rupees?)\s*([\d,]+)/i) ??
    message.match(
      /(?:under|below|less than|கீழ்|குறைவாக|kulla|keela)\s*(?:rs\.?|lkr|ரூ\.?|ரூபாய்|rooba|rupa|rupees?)?\s*([\d,]+)/i,
    ) ??
    message.match(/([\d,]+)\s*(?:க்கு|ku)?\s*(?:கீழ்|குறைவாக|kulla|keela)/i);
  const resolvedBudgetMatch = budgetMatch ?? singlishBudgetMatch ?? tamilBudgetMatch;
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
  const singlishCity =
    /\b(?:colombo|kolamba|kolombo)\s*(?:ta|walata|wala)?\b/i.test(message)
      ? "Colombo"
      : /\b(?:kandy|nuwara|mahanuwara)\s*(?:ta|walata|wala)?\b/i.test(message)
        ? "Kandy"
        : /\b(?:galle|galla)\s*(?:ta|walata|wala)?\b/i.test(message)
          ? "Galle"
          : /\b(?:jaffna|yapanaya)\s*(?:ta|walata|wala)?\b/i.test(message)
            ? "Jaffna"
            : /\b(?:negombo|meegamuwa)\s*(?:ta|walata|wala)?\b/i.test(message)
              ? "Negombo"
              : /\b(?:matara)\s*(?:ta|walata|wala)?\b/i.test(message)
                ? "Matara"
                : /\b(?:kurunegala)\s*(?:ta|walata|wala)?\b/i.test(message)
                  ? "Kurunegala"
                  : null;
  const tamilCity =
    /கண்டி/.test(message)
      ? "Kandy"
      : /கொழும்பு/.test(message)
        ? "Colombo"
        : /காலி/.test(message)
          ? "Galle"
          : /யாழ்ப்பாணம்|யாழ்/.test(message)
            ? "Jaffna"
            : /நீர்கொழும்பு/.test(message)
              ? "Negombo"
              : null;
  const tanglishCity =
    /\bcolombo\s*(?:ku|kku)?\b/i.test(message)
      ? "Colombo"
      : /\bkandy\s*(?:ku|kku)?\b/i.test(message)
        ? "Kandy"
        : /\bgalle\s*(?:ku|kku)?\b/i.test(message)
          ? "Galle"
          : /\bjaffna\s*(?:ku|kku)?\b/i.test(message)
            ? "Jaffna"
            : /\bnegombo\s*(?:ku|kku)?\b/i.test(message)
              ? "Negombo"
              : null;

  // Don't default to random products when we can't parse intent —
  // the reply builder will ask the user to clarify instead.

  return {
    search_queries: Array.from(searchQueries).slice(0, 3),
    max_price: resolvedBudgetMatch ? Number(resolvedBudgetMatch[1].replace(/,/g, "")) : null,
    city: cityMatch?.[1] ?? sinhalaCity ?? singlishCity ?? tamilCity ?? tanglishCity,
    language: detectMessageLanguage(message) ?? "english",
    situation: situation.situation,
    emotional_tone: situation.emotional_tone,
    suggested_addons: situation.suggested_addons,
  };
}

const TANGLISH_WORDS = new Set([
  "akka",
  "amma",
  "annai",
  "anna",
  "appa",
  "cake",
  "giftu",
  "kadhal",
  "kadhali",
  "kadhalan",
  "kanavan",
  "keela",
  "kulla",
  "malar",
  "manaivi",
  "nandri",
  "parisu",
  "pirandha",
  "pirantha",
  "poo",
  "pookal",
  "rooba",
  "rupa",
  "saaklet",
  "sandai",
  "thambi",
  "thangachi",
  "thevai",
  "venum",
]);

const SINGLISH_WORDS = new Set([
  "adare",
  "aduwen",
  "aiya",
  "akkata",
  "amma",
  "ammata",
  "ane",
  "ayubowan",
  "baba",
  "balanna",
  "denna",
  "eka",
  "ekak",
  "ewanna",
  "eyata",
  "ganna",
  "hari",
  "hoda",
  "hoyala",
  "istuti",
  "kaatada",
  "kata",
  "kawda",
  "kiyanna",
  "kohomada",
  "mage",
  "malli",
  "mama",
  "mata",
  "mokakda",
  "nangi",
  "ona",
  "onee",
  "oni",
  "oya",
  "oyage",
  "oyata",
  "podda",
  "podi",
  "puluwan",
  "randu",
  "rosa",
  "rupiyal",
  "samawa",
  "sthuthi",
  "taggak",
  "thagi",
  "thaththa",
  "thegi",
  "upandin",
  "upandina",
  "walata",
  "yawanna",
  "yata",
]);

// Common English words that should NOT trigger Singlish detection even if they
// overlap with Singlish vocabulary (e.g. "one" means "ඕනේ" in Singlish but is
// extremely common in English).
const ENGLISH_STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "am",
  "i", "me", "my", "we", "our", "you", "your", "he", "she", "it", "they",
  "this", "that", "these", "those",
  "do", "does", "did", "will", "would", "can", "could", "should", "may", "might",
  "have", "has", "had", "be", "been", "being",
  "in", "on", "at", "to", "for", "of", "with", "from", "by", "about", "into",
  "and", "or", "but", "not", "no", "so", "if", "as", "than",
  "what", "which", "who", "how", "when", "where", "why",
  "all", "some", "any", "each", "one", "two", "three",
  "get", "give", "go", "come", "make", "take", "want", "need", "find", "send",
  "good", "best", "nice", "great",
  "under", "over", "below", "above", "less", "more",
  "something", "anything", "nothing", "everything",
  "just", "also", "very", "really", "please", "thank", "thanks",
]);

function normalizeLanguage(language: unknown): AppLanguage | null {
  return language === "english" ||
    language === "sinhala" ||
    language === "singlish" ||
    language === "tamil" ||
    language === "tanglish"
    ? language
    : null;
}

function detectTanglish(message: string) {
  const normalized = message.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const words = normalized.match(/[a-z]+/g) ?? [];
  const hits = words.filter((word) => TANGLISH_WORDS.has(word)).length;

  if (hits >= 2) return true;
  if (/\b(?:amma|appa|akka|anna|thambi|thangachi)\s*(?:ku|kku)\b/i.test(normalized)) return true;

  return /\b(?:enakku|ennaku|venum|thevai|parisu|pookal|malar|rooba|rupa|kulla|keela|pirandha|pirantha|anupu|anuppu|amma(?:ku|kku)|appa(?:ku|kku)|akka(?:ku|kku)|anna(?:ku|kku))\b/i.test(
    normalized,
  );
}

function detectSinglish(message: string) {
  const normalized = message.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const words = normalized.match(/[a-z]+/g) ?? [];
  // Only count words that are in the Singlish set AND are NOT common English words
  const singlishHits = words.filter((word) => SINGLISH_WORDS.has(word) && !ENGLISH_STOP_WORDS.has(word)).length;
  const englishHits = words.filter((word) => ENGLISH_STOP_WORDS.has(word)).length;

  // If the message is predominantly English words, require stronger Singlish evidence
  const threshold = englishHits > singlishHits ? 3 : 2;
  if (singlishHits >= threshold) return true;

  // Strong Singlish markers: these suffixed pronouns are very unlikely in English
  if (/\b(?:mata|mage|mama|oyata|eyata|ammata|thaththata|akkata|nangita|aiyata|mallita|yaluwata)\b/i.test(normalized)) {
    return true;
  }

  return /\b(?:kohomada|mokakda|kawda|kaatada|kiyanna|puluwan|hoyala|yawanna|ewanna|denna|ganna|karanna|ona|onee|oni|aduwen|rupiyal|thagi|thegi|taggak|samawa|sthuthi|ayubowan)\b/i.test(
    normalized,
  );
}

function looksLikeEnglish(message: string) {
  const normalized = message.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const words = normalized.match(/[a-z]+/g) ?? [];
  if (words.length === 0) return false;
  const englishCount = words.filter((word) => ENGLISH_STOP_WORDS.has(word)).length;
  // If more than 40% of the words are common English, treat as English
  return englishCount / words.length > 0.4;
}

function detectMessageLanguage(message: string): AppLanguage | null {
  if (/[\u0D80-\u0DFF]/.test(message)) return "sinhala";
  if (/[\u0B80-\u0BFF]/.test(message)) return "tamil";
  if (detectSinglish(message)) return "singlish";
  if (detectTanglish(message)) return "tanglish";
  // Positively identify English so callers can distinguish "detected English"
  // from "could not detect anything"
  if (looksLikeEnglish(message)) return "english";
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

  if (language === "singlish") {
    return "Reply in friendly Singlish: Sinhala meaning in Latin letters mixed naturally with simple English. Do not use Sinhala script unless the user used Sinhala script. Product names, product IDs, brand names, prices, and URLs may remain exactly as provided.";
  }

  if ((language as string | null) === "tamil") {
    return "Reply in natural Tamil using Tamil script. Product names, product IDs, brand names, prices, and URLs may remain exactly as provided.";
  }

  if (language === "tanglish") {
    return "Reply in friendly Tanglish: Tamil meaning in Latin letters mixed naturally with simple English. Do not use Tamil script unless the user used Tamil script. Product names, product IDs, brand names, prices, and URLs may remain exactly as provided.";
  }

  return "Reply in English.";
}

function responseStyleInstruction(preferences: ResponsePreferences) {
  const tone = {
    warm: "warm, caring, and supportive — like a close friend who's excited to help you find the perfect gift. Use a conversational, personal style. Show genuine enthusiasm and empathy",
    professional: "professional, polished, and direct",
    playful: "playful, cheerful, and light — like chatting with your best friend who knows all the best gift ideas. Be bubbly, use casual language, and show you genuinely care",
    concise: "concise, practical, and low-fluff",
  }[preferences.tone];
  const emoji = {
    none: "Do not use emojis.",
    light: "Use at most one relevant emoji if it feels natural.",
    expressive: "Use emojis generously throughout your response! 🎁🌸💝 Sprinkle them naturally to add warmth and personality. Every greeting, recommendation, and sign-off should have emojis.",
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
  const cleaned = value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";

  return cleaned
    .split(" ")
    .map((word) => {
      const lower = word.toLowerCase();
      if (["for", "in", "to", "and", "with"].includes(lower)) return lower;
      return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
    })
    .join(" ");
}

function titleRecipient(message: string, plan?: ShoppingPlan) {
  const planned = typeof plan?.recipient === "string" ? plan.recipient.trim() : "";
  if (planned && !/^(recipient|person|someone|user)$/i.test(planned)) return titleCase(planned);

  const recipientRules: Array<[RegExp, string]> = [
    [/\b(girlfriend|gf|pemwathiya|kadhali)\b|පෙම්වතිය|காதலி/iu, "girlfriend"],
    [/\b(boyfriend|bf|pemwatha|kadhalan)\b|පෙම්වතා|காதலன்/iu, "boyfriend"],
    [/\b(wife|birinda|manaivi)\b|බිරිඳ|මගේ නෝනා|மனைவி/iu, "wife"],
    [/\b(husband|swamiya|kanavan)\b|ස්වාමි|සැමියා|கணவர்/iu, "husband"],
    [/\b(amma|ammata|mom|mother)\b|අම්ම|அம்மா/iu, "Amma"],
    [/\b(thaththa|thathta|dad|father|appa)\b|තාත්ත|அப்பா/iu, "Thaththa"],
    [/\b(akka|akkata|sister)\b|අක්ක|அக்கா/iu, "sister"],
    [/\b(nangi|nangita|sister)\b|නංගි|தங்கை/iu, "sister"],
    [/\b(aiya|ayya|aiyata|brother|anna)\b|අයිය|அண்ணா/iu, "brother"],
    [/\b(malli|mallita|brother|thambi)\b|මල්ලි|தம்பி/iu, "brother"],
    [/\b(friend|yaluwa|yaluwata)\b|යාලු|நண்ப/iu, "friend"],
    [/\b(teacher|guruthumi|sir|madam)\b|ගුරු|ஆசிரிய/iu, "teacher"],
    [/\b(boss|manager)\b/iu, "boss"],
    [/\b(kid|child|baby|baba|lama|podda|podi)\b|ළම|බබා|குழந்தை/iu, "child"],
  ];

  return recipientRules.find(([pattern]) => pattern.test(message))?.[1] ?? null;
}

function titleOccasion(message: string, plan?: ShoppingPlan) {
  const planned = typeof plan?.occasion === "string" ? plan.occasion.trim() : "";
  if (planned) return titleCase(planned);

  if (/break\s*up|broke\s*up|sorry|apolog|forgive|randu|tharaha|samawa|sorry\s*kiyanna|pirinju|மன்னிப்பு|சண்டை|பிரிவு/iu.test(message)) {
    return "Apology";
  }
  if (/birthday|bday|upandin|upandina|උපන්|பிறந்தநாள்|பிறந்த நாள்/iu.test(message)) return "Birthday";
  if (/anniversary|sangwathsara|සංවත්සර|திருமண நாள்/iu.test(message)) return "Anniversary";
  if (/sympathy|condolence|funeral|maranaya|anuthabam|අනුකම්පා|அனுதாபம்|இறப்பு/iu.test(message)) return "Sympathy";
  if (/thank|thanks|sthuthi|istuti|nandri|ස්තුති|நன்றி/iu.test(message)) return "Thank-you";
  if (/romantic|love|adare|aadare|kadhal|ආදර|காதல்/iu.test(message)) return "Romantic";

  return null;
}

function titleProduct(message: string, plan?: ShoppingPlan) {
  const queries = plan?.search_queries?.join(" ") ?? "";
  const haystack = `${message} ${queries}`;

  const productRules: Array<[RegExp, string]> = [
    [/flower|rose|bouquet|mal|rosa|මල්|රෝස|மலர்|பூ|ரோஜா/iu, "flowers"],
    [/cake|kek|කේක්|கேக்/iu, "cake"],
    [/choco|chocolate|chokalat|චොක|சாக்ல/iu, "chocolates"],
    [/hamper|basket|bundle|හැම්පර්|ஹாம்பர்/iu, "hamper"],
    [/perfume|fragrance/iu, "perfume"],
    [/toy|lama|kid|child|ළම|குழந்தை/iu, "toy"],
    [/card|greeting|note/iu, "card"],
  ];

  return productRules.find(([pattern]) => pattern.test(haystack))?.[1] ?? "gift";
}

function conversationTitle(message: string, plan?: ShoppingPlan) {
  if (hasTrackingIntent(message)) return "Order tracking";

  if (!hasShoppingIntent(message)) {
    if (/president|janadipathi|ජනාධිපති|ஜனாதிபதி/iu.test(message)) return "General question: president";
    return "General question";
  }

  const recipient = titleRecipient(message, plan);
  const occasion = titleOccasion(message, plan);
  const product = titleProduct(message, plan);
  const city = plan?.city ? titleCase(plan.city) : null;
  const productLabel = product === "gift" ? "gift" : product;
  let base = "Kapruka gift ideas";

  if (occasion === "Apology" && productLabel === "flowers") {
    base = recipient ? `Apology flowers for ${recipient}` : "Apology flowers";
  } else if (occasion && recipient) {
    base = `${occasion} gift for ${recipient}`;
  } else if (recipient) {
    base = `${titleCase(productLabel)} for ${recipient}`;
  } else if (occasion) {
    base = `${occasion} ${productLabel}`;
  } else if (productLabel !== "gift") {
    base = titleCase(productLabel);
  } else if (city) {
    base = `Gift delivery to ${city}`;
  }

  if (city && !base.toLowerCase().includes(city.toLowerCase()) && base.length <= 34) {
    base = `${base} in ${city}`;
  }

  return compactTitle(base);
}

function shouldRefreshConversationTitle(currentTitle: string | null | undefined, firstMessage: string) {
  const title = currentTitle?.trim();
  if (!title || title === DEFAULT_CONVERSATION_TITLE) return true;
  return title === legacyConversationTitle(firstMessage);
}

function conversationTitleUpdate(currentTitle: string | null | undefined, firstMessage: string, plan?: ShoppingPlan) {
  return shouldRefreshConversationTitle(currentTitle, firstMessage) ? { title: conversationTitle(firstMessage, plan) } : {};
}

function hasTrackingIntent(message: string) {
  return (
    /\b(track|tracking|status|where.*order|order status|order number|track panna|order enga|enga.*order|order eka koheda|order eke status|order number eka)\b/i.test(message) ||
    /ඕඩර්|ඇණවුම|ට්‍රැක්|තත්ත්වය|කොහෙද/u.test(message) ||
    /டிராக்|ஆர்டர்.*(?:நிலை|எங்கே)|(?:நிலை|எங்கே).*ஆர்டர்/u.test(message)
  );
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

function buildMissingTrackingReply(language: AppLanguage | null) {
  if (language === "sinhala") {
    return "Paid order confirmation email එකේ හෝ order complete page එකේ තියෙන Kapruka order number එක එවන්න. ඒක payment කලින් පෙන්වන checkout ref එකට වෙනස්.";
  }

  if (language === "singlish") {
    return "Paid order confirmation email eke hari order complete page eke thiyena Kapruka order number eka ewanna. Eka payment kalin pennana checkout ref ekata wenas.";
  }

  if (language === "tamil") {
    return "Paid order confirmation email அல்லது order complete page-ல் இருக்கும் Kapruka order number-ஐ அனுப்புங்கள். அது payment முன் காட்டும் checkout ref-இலிருந்து வேறுபடும்.";
  }

  if (language === "tanglish") {
    return "Paid order confirmation email illa order complete page-la irukkura Kapruka order number-a anuppunga. Adhu payment-ku munnaadi varra checkout ref vida different.";
  }

  return "Please send the Kapruka order number from your paid order confirmation email or order complete page. It is different from the checkout ref shown before payment.";
}

function hasShoppingIntent(message: string) {
  const englishIntent =
    /\b(gift|present|buy|send|shop|shopping|find|recommend|suggest|search|order|checkout|cart|deliver|delivery|kapruka|product|item|price|budget|under|rs\.?|lkr|cake|birthday|bday|flower|rose|bouquet|chocolate|choco|hamper|basket|card|perfume|toy|anniversary|romantic|wife|husband|mother|mom|amma|father|dad|sister|brother|friend|teacher|boss|colombo|kandy|galle|jaffna|negombo|matara|kurunegala|anuradhapura|today|tomorrow)\b/i.test(message);
  const sinhalaIntent =
    /තෑග|තැග|ගිෆ්ට්|අම්ම|තාත්ත|අක්ක|නංගි|අයිය|මල්|රෝස|කේක්|චොකලට්|හැම්පර්|උපන්|උපන්දින|සංවත්සර|රුපියල්|රු\.?|අඩු|අඩුවෙන්|යටතේ|මිල|බජට්|යව|එව|බෙදා|කොළඹ|මහනුවර|නුවර|ගාල්ල|යාපනය|මීගමුව|මාතර|කුරුණෑගල|අනුරාධපුර|ඕන|ඔන|හොය|සොය/u.test(message);
  const singlishIntent =
    /\b(thagi|thegi|taggak|gift\s*ekak|present\s*ekak|mal|rosa|cake|kek|choco|chocolate|hamper|upandin|upandina|birthday|ammata|thaththata|akkata|nangita|aiyata|mallita|yaluwata|yawanna|ewanna|denna|ganna|hoyala|delivery|budget|rupiyal|rs\.?|lkr|aduwen|yata|yatin|athule|colombo|kolamba|nuwara|mahanuwara|kandy|galla|yapanaya|meegamuwa)\b/i.test(
      message,
    ) ||
    (detectSinglish(message) &&
      /\b(gift|present|cake|kek|mal|rosa|flower|rose|choco|chocolate|hamper|card|delivery|budget|rs\.?|lkr|rupiyal|aduwen|yata|yawanna|ewanna|hoyala|denna|ganna|ona|one|onee|oni)\b/i.test(
        message,
      ));
  const tamilIntent =
    /பரிசு|கிப்ட்|அம்மா|அப்பா|அக்கா|அண்ணா|தங்கை|தம்பி|மலர்|பூ|ரோஜா|கேக்|சாக்லேட்|ஹாம்பர்|பிறந்தநாள்|பிறந்த நாள்|திருமண நாள்|ரூபாய்|ரூ\.?|கீழ்|குறைவாக|விலை|பட்ஜெட்|அனுப்பு|டெலிவரி|கொழும்பு|கண்டி|காலி|யாழ்ப்பாணம்|வேண்டும்|தேவை|தேடு/u.test(
      message,
    );
  const tanglishIntent =
    /\b(parisu|giftu|venum|thevai|pookal|poo|malar|roja|saaklet|pirandha|pirantha|kulla|keela|rooba|rupa|anupu|anuppu|delivery|amma|appa|akka|anna|thambi|thangachi|kadhal|kadhali|kadhalan|manaivi|kanavan)\b/i.test(
      message,
    );

  return englishIntent || sinhalaIntent || singlishIntent || tamilIntent || tanglishIntent;
}

function buildOutOfScopeReply(language: AppLanguage | null, preferences: ResponsePreferences) {
  const useEmojis = preferences.emojiMode !== "none";

  if ((language as AppLanguage | null) === "sinhala") {
    return useEmojis
      ? "අයියෝ, ඒක ගැන මට උදව් කරන්න බෑ 😅 ඒත් තෑගි හොයන්න නම් මම expert! 🎁💝 ඔයාට කාටහරි ලස්සන gift එකක් හොයන්න ඕනේ නම් කියන්නකෝ, මම උදව් කරන්නම්! 😊✨"
      : "අයියෝ, ඒක ගැන මට උදව් කරන්න බෑ. ඒත් තෑගි හොයන්න නම් මම expert! ඔයාට කාටහරි ලස්සන gift එකක් හොයන්න ඕනේ නම් කියන්නකෝ, මම උදව් කරන්නම්!";
  }

  if (language === "singlish") {
    return useEmojis
      ? "Aiyo sorry, eka gena mata help karanna be 😅 But gift hoyanna nam mama expert! 🎁💝 Oyata kawruhari special kenekuta lassana gift ekak hoyanna one nam kiyannako, mama help karannam! 😊✨"
      : "Aiyo sorry, eka gena mata help karanna be. But gift hoyanna nam mama expert! Oyata kawruhari special kenekuta lassana gift ekak hoyanna one nam kiyannako, mama help karannam!";
  }

  if ((language as AppLanguage | null) === "tamil") {
    return useEmojis
      ? "அய்யோ மன்னிக்கணும், அதுக்கு என்னால உதவி பண்ண முடியாது 😅 ஆனா பரிசு தேட நான் expert! 🎁💝 யாருக்காவது அழகான gift வேணும்னா சொல்லுங்க, உதவி பண்றேன்! 😊✨"
      : "அய்யோ மன்னிக்கணும், அதுக்கு என்னால உதவி பண்ண முடியாது. ஆனா பரிசு தேட நான் expert! யாருக்காவது அழகான gift வேணும்னா சொல்லுங்க, உதவி பண்றேன்!";
  }

  if (language === "tanglish") {
    return useEmojis
      ? "Aiyo sorry, adhukku ennala help panna mudiyaadhu 😅 Aana gift theda naan expert! 🎁💝 Yaarukkaavathu azhagaana gift venum-na sollunga, naan help panren! 😊✨"
      : "Aiyo sorry, adhukku ennala help panna mudiyaadhu. Aana gift theda naan expert! Yaarukkaavathu azhagaana gift venum-na sollunga, naan help panren!";
  }

  return useEmojis
    ? "Oops, sorry about that! 😅 I'm not the best at that kind of question, but I'm amazing at finding gifts! 🎁💝 If you need help picking something special for someone, just tell me and I'll be right on it! 😊✨"
    : "Oops, sorry about that! I'm not the best at that kind of question, but I'm amazing at finding gifts! If you need help picking something special for someone, just tell me and I'll be right on it!";
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
              language: "english | sinhala | singlish | tamil | tanglish",
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
              recipient_name: "full name of the gift recipient if mentioned, or null",
              recipient_phone: "phone number of the recipient if mentioned, or null",
              sender_name: "name of the person sending the gift if mentioned, or null",
              delivery_address: "street address for delivery if mentioned, or null",
              gift_message: "gift card message if the user specified one, or null",
              delivery_instructions: "special delivery instructions if mentioned, or null",
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

    const parsedLanguage = normalizeLanguage(parsed?.language);

    return {
      ...fallback,
      ...parsed,
      language: forcedLanguage ?? parsedLanguage ?? fallback.language,
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

  if (language === "singlish") {
    if (deliveryObject.available) {
      return `Delivery available. Fee eka: ${deliveryObject.currency ?? "LKR"} ${deliveryObject.rate ?? "TBC"}.`;
    }

    if (deliveryObject.next_available_date) {
      return `Next available delivery date eka: ${deliveryObject.next_available_date}.`;
    }

    return deliveryObject.reason ? "Select karapu date ekata delivery note ekak thiyenawa." : null;
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

  if (language === "tanglish") {
    if (deliveryObject.available) {
      return `Delivery available. Fee: ${deliveryObject.currency ?? "LKR"} ${deliveryObject.rate ?? "TBC"}.`;
    }

    if (deliveryObject.next_available_date) {
      return `Next available delivery date: ${deliveryObject.next_available_date}.`;
    }

    return deliveryObject.reason ? "Selected date-ku delivery note irukku." : null;
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
  agentInsights?: GiftAgentInsights | null;
}) {
  const { products, plan, delivery, queries, preferences, agentInsights } = params;
  const deliveryLine = summarizeDelivery(delivery, plan.language);
  const language = plan.language ?? "english";
  const emoji = preferences.emojiMode === "none" ? "" : " 🎁";

  if (!products.length) {
    if (queries.length === 0) {
      return "I'm Kavi, your Kapruka gift concierge! 🎁 I'm here to help you find the perfect gift, check delivery availability, and create a pay link. Tell me who you're shopping for, the occasion, your budget, and the delivery city — and I'll get started!";
    }

    const searchedFor = queries.join(", ");

    if ((language as ShoppingPlan["language"]) === "sinhala") {
      return `"${searchedFor}" සඳහා Kapruka හි හොඳ in-stock ගැළපීමක් තවම හමු වුණේ නැහැ. අවස්ථාව, ලබන්නා, budget එක, සහ delivery city එක කියන්න; මම තවත් නිවැරදි සෙවීමක් කරලා දෙන්නම්.${emoji}`;
    }

    if (language === "singlish") {
      return `"${searchedFor}" walata Kapruka eke strong in-stock match ekak thawama hambune naha. Occasion eka, gift eka kaatada, budget eka, delivery city eka kiyanna; mama thawa sharp search ekak karala dennam.${emoji}`;
    }

    if ((language as ShoppingPlan["language"]) === "tamil") {
      return `"${searchedFor}" என்பதற்கு Kapruka-வில் நல்ல in-stock பொருத்தம் இன்னும் கிடைக்கவில்லை. நிகழ்வு, பெறுபவர், budget, delivery city சொல்லுங்கள்; இன்னும் துல்லியமாக தேடுகிறேன்.${emoji}`;
    }

    if (language === "tanglish") {
      return `"${searchedFor}" ku Kapruka-la strong in-stock match innu kidaikkala. Occasion, yaarukku gift, budget, delivery city sollunga; naan sharper-a thedi tharen.${emoji}`;
    }

    if (language === "sinhala") {
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
  const agentText = [
    agentInsights?.bundle
      ? `Bundle agent: ${agentInsights.bundle.title} (${agentInsights.bundle.currency} ${agentInsights.bundle.total}) with item IDs ${agentInsights.bundle.itemIds.join(", ")}.`
      : "",
    agentInsights?.substitutions.length ? `Substitution agent: ${agentInsights.substitutions[0].reason}` : "",
    agentInsights?.recipientMemory ? `Memory agent: remembered context for ${agentInsights.recipientMemory.displayName}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const agentBlock = agentText ? `\n\n${agentText}` : "";

  if (language === "sinhala") {
    const sinhalaDeliveryText = deliveryLine ? `\n\nබෙදාහැරීම: ${deliveryLine}` : "";
    const sinhalaAddonText = plan.suggested_addons?.length ? `\n\nතව එකතු කළොත් හොඳ දේවල්: ${plan.suggested_addons.join(", ")}.` : "";
    return `ඔබේ ඉල්ලීමට ගැළපෙන Kapruka තේරීම් කිහිපයක් හමු වුණා${emoji}\n\n${productLines}${sinhalaDeliveryText}${sinhalaAddonText}\n\nමගේ පළමු යෝජනාව: ${picks[0].name}. මෙයින් එකක් හෝ කිහිපයක් කරත්තයට එකතු කරමුද?`;
  }

  if (language === "singlish") {
    const singlishDeliveryText = deliveryLine ? `\n\nDelivery: ${deliveryLine}` : "";
    const singlishAddonText = plan.suggested_addons?.length ? `\n\nSmall add-ons hodata set wenawa: ${plan.suggested_addons.join(", ")}.` : "";
    return `Oyage request ekata match wena real Kapruka options tikak hambuna${emoji}\n\n${productLines}${singlishDeliveryText}${singlishAddonText}${agentBlock}\n\nMage first pick eka: ${picks[0].name}. Me wage ekak hari dekak cart ekata add karala complete gift ekak hadamuda?`;
  }

  if (language === "tanglish") {
    const tanglishDeliveryText = deliveryLine ? `\n\nDelivery: ${deliveryLine}` : "";
    const tanglishAddonText = plan.suggested_addons?.length ? `\n\nSmall add-ons nalla irukkum: ${plan.suggested_addons.join(", ")}.` : "";
    return `Unga request-ku match aana real Kapruka options kidaichirukku${emoji}\n\n${productLines}${tanglishDeliveryText}${tanglishAddonText}${agentBlock}\n\nEn first pick: ${picks[0].name}. Idhula one or two cart-la add pannalama? Naan gift-a complete panna next step help panren.`;
  }

  if (language === "tamil") {
    const tamilDeliveryText = deliveryLine ? `\n\nவிநியோகம்: ${deliveryLine}` : "";
    const tamilAddonText = plan.suggested_addons?.length ? `\n\nசிறிய add-ons: ${plan.suggested_addons.join(", ")}.` : "";
    return `உங்கள் கோரிக்கைக்கு பொருத்தமான Kapruka தேர்வுகள் கிடைத்தன${emoji}\n\n${productLines}${tamilDeliveryText}${tamilAddonText}\n\nஎன் முதல் பரிந்துரை: ${picks[0].name}. இதில் ஒன்றையோ சிலவற்றையோ வண்டியில் சேர்க்கலாமா?`;
  }

  return `I found some real Kapruka options that fit the request${emoji}\n\n${productLines}${deliveryText}${addonText}${agentBlock}\n\nMy first pick is ${picks[0].name}. Add one or two to the cart and I will help you turn it into a complete gift.`;
}

function buildCheckoutCollectionPrompt(params: {
  plan: ShoppingPlan;
  cartSnapshot?: unknown;
  preferences: ResponsePreferences;
}): string | null {
  const { plan, preferences } = params;
  const cart = Array.isArray(params.cartSnapshot) ? params.cartSnapshot : [];
  const useEmojis = preferences.emojiMode !== "none";

  // Only prompt for checkout details if there are items to buy
  if (cart.length === 0) return null;

  const missing: string[] = [];
  if (!plan.recipient_name) missing.push("recipient's full name");
  if (!plan.recipient_phone) missing.push("recipient's phone number");
  if (!plan.sender_name) missing.push("your name (the sender)");
  if (!plan.delivery_address && !plan.city) missing.push("delivery address and city");
  else if (!plan.delivery_address) missing.push("delivery street address");
  else if (!plan.city) missing.push("delivery city");
  if (!plan.delivery_date) missing.push("preferred delivery date");
  if (!plan.gift_message) missing.push("a gift message for the card");
  if (!plan.delivery_instructions) missing.push("any special delivery instructions (or just say none)");

  if (missing.length === 0) return null;

  // Ask for at most 3-4 things at a time to feel conversational
  const batch = missing.slice(0, 4);
  const list = batch.length === 1
    ? batch[0]
    : batch.slice(0, -1).join(", ") + " and " + batch[batch.length - 1];

  if (useEmojis) {
    if (batch.length <= 2) {
      return `\n\nTo get this gift on its way, could you share ${list}? 📝💛`;
    }
    return `\n\nLet's get this gift ready to send! 🚀💝 Could you tell me ${list}?`;
  }

  return `\n\nTo get this gift on its way, could you share ${list}?`;
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
    const detectedLanguage = detectMessageLanguage(message);
    // If the message is clearly English (or we positively detected a language),
    // use that. Only fall back to selectedLanguage when detection returns null
    // (e.g. very short or ambiguous messages). This prevents the "sticky
    // language" bug where a previous Singlish turn causes English messages to
    // get Singlish replies.
    const replyLanguage = detectedLanguage ?? selectedLanguage;
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
        ? buildMissingTrackingReply(replyLanguage)
        : await trackOrder(trackingOrderNumber)
            .then((tracking) =>
              typeof tracking === "string"
                ? tracking.replace(/^Error:\s*/i, "").trim() || "I could not find tracking for that order number."
                : buildTrackingReply(tracking as OrderTracking),
            )
            .catch((error) => (error instanceof Error ? error.message : "Order tracking failed."));

      await prisma.$transaction([
        prisma.message.create({
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
        }),
        prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            language: replyLanguage ?? "english",
            ...conversationTitleUpdate(conversation.title, message),
          },
        }),
      ]);

      return NextResponse.json({
        reply,
        products: [],
        delivery: null,
        plan: { language: replyLanguage ?? "english" },
        conversationId: conversation.id,
      });
    }

    if (hasTrackingIntent(message)) {
      const reply = buildMissingTrackingReply(replyLanguage);

      await prisma.$transaction([
        prisma.message.create({
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
        }),
        prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            language: replyLanguage ?? "english",
            ...conversationTitleUpdate(conversation.title, message),
          },
        }),
      ]);

      return NextResponse.json({
        reply,
        products: [],
        delivery: null,
        plan: { language: replyLanguage ?? "english" },
        conversationId: conversation.id,
      });
    }

    if (!hasShoppingIntent(message) && history.length === 0) {
      const reply = buildOutOfScopeReply(replyLanguage, responsePreferences);

      await prisma.$transaction([
        prisma.message.create({
          data: {
            conversationId: conversation.id,
            role: "assistant",
            content: reply,
            metadata: {
              out_of_scope: true,
            },
          },
        }),
        prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            language: replyLanguage ?? "english",
            ...conversationTitleUpdate(conversation.title, message),
          },
        }),
      ]);

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

    const agentInsights = await buildGiftAgentInsights({
      actor,
      plan,
      products,
      delivery,
      cartSnapshot: body.cartSnapshot,
    });
    const groundedReply = buildGroundedReply({
      products,
      plan,
      delivery,
      queries,
      preferences: responsePreferences,
      agentInsights,
    });
    const reply = await callOpenRouter(
      [
        {
          role: "system",
          content: `Rewrite the grounded response as a warm, friendly companion helping a dear friend pick the perfect gift — NOT as a corporate bot or a search-results machine. Talk like you're texting a friend you care about. Be genuinely excited about the gift ideas. ${languageInstruction(plan.language ?? replyLanguage ?? "english")} ${responseStyleInstruction(responsePreferences)} ${conciergeMove(plan)} Start by acknowledging the user's situation in one natural sentence. Then give 3-4 grounded product options and one clear recommendation. Suggest a thoughtful next step, such as adding a note card, chocolates, or checking delivery, only if supported by the grounded response. Keep every product name and price exactly as provided. Do not add any product, price, checkout link, table, markdown link, or claim that is not in the grounded response.`,
        },
        ...history.slice(-4).map((msg) => ({
          role: (msg.role === "user" ? "user" : "assistant") as "user" | "assistant",
          content: msg.content,
        })),
        {
          role: "user",
          content: JSON.stringify({
            grounded_response: groundedReply,
            allowed_products: productBrief(products),
            agent_insights: agentInsights,
          }),
        },
      ],
      450,
    ).catch(() => groundedReply)
     .then((candidate) => (products.length > 0 && !candidate.includes(products[0].name) ? groundedReply : candidate));

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
            agentInsights,
          },
        },
      }),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          language: plan.language ?? replyLanguage ?? "english",
          ...conversationTitleUpdate(conversation.title, message, plan),
          cartSnapshot: body.cartSnapshot ?? undefined,
          lastProducts: products,
          lastDelivery: deliveryPayload ?? undefined,
        },
      }),
    ]);

    const checkoutPrompt = buildCheckoutCollectionPrompt({
      plan,
      cartSnapshot: body.cartSnapshot,
      preferences: responsePreferences,
    });
    const finalReply = checkoutPrompt ? reply + checkoutPrompt : reply;

    // Re-save the assistant message with the checkout prompt appended
    if (checkoutPrompt) {
      await prisma.message.updateMany({
        where: { conversationId: conversation.id, role: "assistant", content: reply },
        data: { content: finalReply },
      });
    }

    return NextResponse.json({
      reply: finalReply,
      products,
      delivery: deliveryPayload,
      plan,
      agentInsights,
      conversationId: conversation.id,
      extractedCheckout: {
        recipientName: plan.recipient_name ?? null,
        recipientPhone: plan.recipient_phone ?? null,
        senderName: plan.sender_name ?? null,
        address: plan.delivery_address ?? null,
        city: plan.city ?? null,
        date: plan.delivery_date ?? null,
        giftMessage: plan.gift_message ?? null,
        instructions: plan.delivery_instructions ?? null,
      },
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
