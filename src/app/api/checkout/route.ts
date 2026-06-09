import { NextResponse } from "next/server";
import { checkDelivery, createOrder, listDeliveryCities } from "@/lib/kapruka";
import type { CheckoutPayload } from "@/lib/types";
import { getActor, getOwnedConversation } from "@/lib/actor";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

type CityMatch = {
  name: string;
  aliases?: string[];
};

type CityLookup = {
  cities?: CityMatch[];
  total_matched?: number;
};

type CheckoutSuccess = {
  summary: {
    items_total: number;
    delivery_fee: number;
    addons_total: number;
    currency: string;
    grand_total: number;
  };
  checkout_url: string;
  expires_at: string;
  order_ref: string;
};

function asCityLookup(value: unknown): CityLookup {
  if (value && typeof value === "object" && Array.isArray((value as CityLookup).cities)) {
    return value as CityLookup;
  }

  return { cities: [] };
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function addressSearchTerms(address: string) {
  return address
    .split(",")
    .map((part) => part.trim())
    .filter((part) => /^[a-zA-Z ]{3,}$/.test(part))
    .reverse();
}

function parseJsonFromText(text: string): unknown {
  const cleaned = text.replace(/```json|```/gi, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }

  return null;
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function coerceCheckoutSuccess(value: unknown): CheckoutSuccess | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as {
    summary?: Record<string, unknown>;
    checkout_url?: unknown;
    checkoutUrl?: unknown;
    url?: unknown;
    expires_at?: unknown;
    expiresAt?: unknown;
    order_ref?: unknown;
    orderRef?: unknown;
  };
  const summary = candidate.summary;
  const checkoutUrl = candidate.checkout_url ?? candidate.checkoutUrl ?? candidate.url;

  if (!summary || typeof checkoutUrl !== "string") {
    return null;
  }

  const itemsTotal = toNumber(summary.items_total ?? summary.itemsTotal);
  const deliveryFee = toNumber(summary.delivery_fee ?? summary.deliveryFee ?? summary.shipping_price);
  const addonsTotal = toNumber(summary.addons_total ?? summary.addonsTotal) ?? 0;
  const grandTotal = toNumber(summary.grand_total ?? summary.grandTotal ?? summary.total);
  const currency = typeof summary.currency === "string" ? summary.currency : "LKR";

  if (itemsTotal === null || deliveryFee === null || grandTotal === null) {
    return null;
  }

  return {
    summary: {
      items_total: itemsTotal,
      delivery_fee: deliveryFee,
      addons_total: addonsTotal,
      currency,
      grand_total: grandTotal,
    },
    checkout_url: checkoutUrl,
    expires_at:
      typeof candidate.expires_at === "string"
        ? candidate.expires_at
        : typeof candidate.expiresAt === "string"
          ? candidate.expiresAt
          : new Date().toISOString(),
    order_ref:
      typeof candidate.order_ref === "string"
        ? candidate.order_ref
        : typeof candidate.orderRef === "string"
          ? candidate.orderRef
          : "Pending",
  };
}

function findCheckoutSuccess(value: unknown, depth = 0): CheckoutSuccess | null {
  if (depth > 8 || value == null) return null;

  if (typeof value === "string") {
    const parsed = parseJsonFromText(value);
    return parsed ? findCheckoutSuccess(parsed, depth + 1) : null;
  }

  const coerced = coerceCheckoutSuccess(value);
  if (coerced) return coerced;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findCheckoutSuccess(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof value === "object") {
    for (const nested of Object.values(value)) {
      const found = findCheckoutSuccess(nested, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

async function resolveDeliveryCity(city: string, address: string) {
  const lookup = asCityLookup(await listDeliveryCities(city));
  const cityMatches = lookup.cities ?? [];
  const exactCity = cityMatches.find((match) => normalize(match.name) === normalize(city));

  if (exactCity) {
    return { city: exactCity.name, suggestions: cityMatches.map((match) => match.name) };
  }

  if (cityMatches.length === 1) {
    return { city: cityMatches[0].name, suggestions: cityMatches.map((match) => match.name) };
  }

  for (const term of addressSearchTerms(address)) {
    const addressLookup = asCityLookup(await listDeliveryCities(term));
    const addressMatches = addressLookup.cities ?? [];

    if (addressMatches.length === 1) {
      return {
        city: addressMatches[0].name,
        suggestions: [
          ...new Set([...addressMatches.map((match) => match.name), ...cityMatches.map((match) => match.name)]),
        ],
      };
    }
  }

  return {
    city: null,
    suggestions: cityMatches.map((match) => match.name).slice(0, 12),
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CheckoutPayload & { conversationId?: string | null };
    const { conversationId, ...payload } = body;
    const actor = await getActor();

    if (!actor) {
      return NextResponse.json({ error: "Sign in or continue as guest first." }, { status: 401 });
    }

    if (!payload.cart?.length) {
      return NextResponse.json({ error: "Cart is empty." }, { status: 400 });
    }

    if (!payload.recipient?.name || !payload.recipient?.phone) {
      return NextResponse.json({ error: "Recipient name and phone are required." }, { status: 400 });
    }

    if (!payload.delivery?.address || !payload.delivery?.city || !payload.delivery?.date) {
      return NextResponse.json({ error: "Delivery address, city, and date are required." }, { status: 400 });
    }

    if (!payload.sender?.name) {
      return NextResponse.json({ error: "Sender name is required." }, { status: 400 });
    }

    const resolved = await resolveDeliveryCity(payload.delivery.city, payload.delivery.address);

    if (!resolved.city) {
      return NextResponse.json(
        {
          error: "Please choose a specific Kapruka delivery city.",
          code: "city_ambiguous",
          suggestions: resolved.suggestions,
        },
        { status: 400 },
      );
    }

    const deliveryCheck = await checkDelivery({
      city: resolved.city,
      delivery_date: payload.delivery.date,
      product_id: payload.cart[0]?.product_id ?? null,
    });
    const normalizedPayload: CheckoutPayload = {
      ...payload,
      delivery: {
        ...payload.delivery,
        city: resolved.city,
      },
    };
    const result = await createOrder(normalizedPayload);
    const checkout = findCheckoutSuccess(result);

    if (!checkout) {
      return NextResponse.json(
        {
          error: "Kapruka created a response, but the checkout link format was unexpected.",
          raw_result: result,
        },
        { status: 502 },
      );
    }

    const ownedConversation = conversationId ? await getOwnedConversation(conversationId, actor) : null;

    await prisma.checkoutRecord.create({
      data: {
        conversationId: ownedConversation?.id,
        ...(actor.type === "user" ? { userId: actor.userId } : { guestSessionId: actor.guestSessionId }),
        orderRef: checkout.order_ref,
        checkoutUrl: checkout.checkout_url,
        summary: checkout.summary,
        expiresAt: checkout.expires_at ? new Date(checkout.expires_at) : null,
        rawResult: JSON.parse(JSON.stringify(result)),
      },
    });

    if (ownedConversation) {
      await prisma.conversation.update({
        where: { id: ownedConversation.id },
        data: {
          cartSnapshot: normalizedPayload.cart,
        },
      });
    }

    return NextResponse.json({ result: checkout, normalized_city: resolved.city, delivery_check: deliveryCheck });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Checkout failed.",
      },
      { status: 500 },
    );
  }
}
