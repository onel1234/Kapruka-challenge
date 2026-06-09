import type { Actor } from "@/lib/actor";
import { prisma } from "@/lib/db";
import type {
  BundleRecommendation,
  CartItem,
  CheckoutPayload,
  CheckoutReadiness,
  GiftAgentInsights,
  Product,
  RecipientMemoryProfile,
  SubstitutionSuggestion,
} from "@/lib/types";

export type AgentShoppingPlan = {
  max_price?: number | null;
  min_price?: number | null;
  city?: string | null;
  delivery_date?: string | null;
  occasion?: string | null;
  recipient?: string | null;
  emotional_tone?: "apology" | "romantic" | "celebration" | "sympathy" | "gratitude" | "practical" | null;
  suggested_addons?: string[];
};

type DeliveryLike = {
  available?: boolean;
  reason?: string;
  next_available_date?: string;
};

type CheckoutDraft = Partial<CheckoutPayload> & {
  cart?: CheckoutPayload["cart"];
};

const GENERIC_RECIPIENTS = new Set(["recipient", "person", "someone", "friend", "user", "customer"]);

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeRecipientKey(value: string) {
  return compact(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function recipientKeyFromPlan(plan: AgentShoppingPlan) {
  const recipient = typeof plan.recipient === "string" ? compact(plan.recipient) : "";
  if (!recipient || GENERIC_RECIPIENTS.has(recipient.toLowerCase())) return null;
  return normalizeRecipientKey(recipient);
}

function productText(product: Product) {
  return `${product.name} ${product.summary ?? ""} ${product.category?.name ?? ""}`.toLowerCase();
}

function productCategory(product: Product) {
  const text = productText(product);
  if (/cake|gateau|cupcake|icing/.test(text)) return "cake";
  if (/flower|rose|bouquet|floral|orchid|lily/.test(text)) return "flowers";
  if (/chocolate|choco|sweet|candy|truffle/.test(text)) return "chocolates";
  if (/card|greeting|note/.test(text)) return "card";
  if (/hamper|basket|bundle|gift pack/.test(text)) return "hamper";
  if (/perfume|fragrance/.test(text)) return "perfume";
  if (/toy|teddy|doll|kid|baby/.test(text)) return "toy";
  return product.category?.name?.toLowerCase() ?? "gift";
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function uniqueProducts(products: Product[]) {
  const seen = new Set<string>();
  return products.filter((product) => {
    if (seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  });
}

function expectedAddonCategories(plan: AgentShoppingPlan) {
  const expected = new Set<string>();

  if (plan.emotional_tone === "apology") {
    expected.add("flowers");
    expected.add("card");
    expected.add("chocolates");
  } else if (plan.emotional_tone === "romantic") {
    expected.add("flowers");
    expected.add("chocolates");
    expected.add("card");
  } else if (plan.emotional_tone === "sympathy") {
    expected.add("flowers");
    expected.add("card");
  } else if (/birthday/i.test(plan.occasion ?? "")) {
    expected.add("cake");
    expected.add("card");
    expected.add("chocolates");
  } else if (plan.suggested_addons?.length) {
    for (const addon of plan.suggested_addons) {
      if (/card|note|message/i.test(addon)) expected.add("card");
      if (/choco|sweet/i.test(addon)) expected.add("chocolates");
      if (/flower|rose/i.test(addon)) expected.add("flowers");
    }
  }

  return Array.from(expected);
}

function pickDifferentCategory(products: Product[], usedIds: Set<string>, category: string) {
  return products.find((product) => !usedIds.has(product.id) && productCategory(product) === category);
}

export function buildBundleRecommendation(params: {
  plan: AgentShoppingPlan;
  products: Product[];
  memory?: RecipientMemoryProfile | null;
}): BundleRecommendation | null {
  const products = uniqueProducts(params.products).filter((product) => product.in_stock !== false);
  if (!products.length) return null;

  const budget = params.plan.max_price ?? null;
  const primary =
    products.find((product) => {
      if (!budget) return true;
      return product.price.amount <= budget;
    }) ?? products[0];
  const usedIds = new Set([primary.id]);
  const selected = [primary];
  const expected = unique([
    ...expectedAddonCategories(params.plan),
    ...(params.memory?.preferredCategories ?? []).slice(0, 2),
  ]);

  for (const category of expected) {
    if (productCategory(primary) === category) continue;
    const addon = pickDifferentCategory(products, usedIds, category);
    if (!addon) continue;

    const nextTotal = selected.reduce((total, product) => total + product.price.amount, 0) + addon.price.amount;
    if (!budget || nextTotal <= budget * 1.15) {
      selected.push(addon);
      usedIds.add(addon.id);
    }
  }

  if (selected.length < 2) {
    const affordableAddon = products.find((product) => {
      if (usedIds.has(product.id)) return false;
      if (!budget) return true;
      return primary.price.amount + product.price.amount <= budget * 1.15;
    });
    if (affordableAddon) selected.push(affordableAddon);
  }

  const selectedCategories = selected.map(productCategory);
  const missingAddons = expected.filter((category) => !selectedCategories.includes(category));
  const total = selected.reduce((sum, product) => sum + product.price.amount, 0);
  const recipient = params.plan.recipient ? ` for ${params.plan.recipient}` : "";
  const occasion = params.plan.occasion ? `${params.plan.occasion} ` : "";

  return {
    title: `${occasion}gift bundle${recipient}`.replace(/\s+/g, " ").trim(),
    itemIds: selected.map((product) => product.id),
    total,
    currency: selected[0]?.price.currency ?? "LKR",
    rationale:
      selected.length > 1
        ? `Pairs ${primary.name} with complementary add-ons so the gift feels complete.`
        : `${primary.name} is the strongest starting point for this request.`,
    missingAddons,
  };
}

function deliveryObject(delivery: unknown): DeliveryLike | null {
  if (!delivery || typeof delivery !== "object") return null;
  const candidate = delivery as { raw?: unknown };
  if (candidate.raw && typeof candidate.raw === "object") return candidate.raw as DeliveryLike;
  return delivery as DeliveryLike;
}

export function buildSubstitutionSuggestions(params: {
  plan: AgentShoppingPlan;
  products: Product[];
  delivery?: unknown;
}): SubstitutionSuggestion[] {
  const products = uniqueProducts(params.products);
  const suggestions: SubstitutionSuggestion[] = [];
  const budget = params.plan.max_price ?? null;
  const unavailable = products.filter((product) => product.in_stock === false);

  for (const product of unavailable.slice(0, 2)) {
    const category = productCategory(product);
    const alternatives = products.filter(
      (candidate) => candidate.id !== product.id && candidate.in_stock !== false && productCategory(candidate) === category,
    );
    if (alternatives.length) {
      suggestions.push({
        originalProductId: product.id,
        reason: `${product.name} may not be available, so here are nearby in-stock alternatives.`,
        alternatives: alternatives.slice(0, 3),
      });
    }
  }

  if (budget) {
    const overBudget = products.find((product) => product.price.amount > budget);
    const alternatives = products.filter((product) => product.in_stock !== false && product.price.amount <= budget);
    if (overBudget && alternatives.length) {
      suggestions.push({
        originalProductId: overBudget.id,
        reason: `The first strong match can exceed the Rs. ${budget.toLocaleString("en-LK")} budget.`,
        alternatives: alternatives.slice(0, 3),
      });
    }
  }

  const delivery = deliveryObject(params.delivery);
  if (delivery && delivery.available === false) {
    const alternatives = products.filter((product) => product.in_stock !== false).slice(1, 4);
    suggestions.push({
      originalProductId: products[0]?.id,
      reason: delivery.next_available_date
        ? `Delivery may not work for the selected date. Next available date: ${delivery.next_available_date}.`
        : delivery.reason ?? "Delivery may not work for the selected city or date.",
      alternatives,
    });
  }

  return suggestions.slice(0, 3);
}

function cartFromSnapshot(cartSnapshot: unknown): CartItem[] {
  if (!Array.isArray(cartSnapshot)) return [];
  return cartSnapshot.filter((item): item is CartItem => {
    return Boolean(
      item &&
        typeof item === "object" &&
        "product" in item &&
        item.product &&
        typeof item.product === "object" &&
        "id" in item.product,
    );
  });
}

function hasValue(value: unknown) {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

export function buildCheckoutReadiness(params: {
  cartSnapshot?: unknown;
  checkout?: CheckoutDraft;
  plan?: AgentShoppingPlan;
  delivery?: unknown;
}): CheckoutReadiness {
  const cartItems = params.checkout?.cart?.length
    ? params.checkout.cart
    : cartFromSnapshot(params.cartSnapshot).map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
        icing_text: item.icingText ?? null,
      }));
  const missing: string[] = [];
  const warnings: string[] = [];

  if (!cartItems.length) missing.push("Add at least one product to the cart");
  if (!hasValue(params.checkout?.recipient?.name)) missing.push("Recipient name");
  if (!hasValue(params.checkout?.recipient?.phone)) missing.push("Recipient phone");
  if (!hasValue(params.checkout?.sender?.name)) missing.push("Sender name");
  if (!hasValue(params.checkout?.delivery?.address)) missing.push("Delivery street address");
  if (!hasValue(params.checkout?.delivery?.city ?? params.plan?.city)) missing.push("Kapruka delivery city");
  if (!hasValue(params.checkout?.delivery?.date ?? params.plan?.delivery_date)) missing.push("Delivery date");

  if (!hasValue(params.checkout?.gift_message)) {
    warnings.push("A short gift message would make the order feel more personal");
  }

  const delivery = deliveryObject(params.delivery);
  if (delivery?.available === false) {
    warnings.push(delivery.reason ?? "Delivery availability needs attention for this city or date");
  }

  const score = Math.max(0, 100 - missing.length * 13 - warnings.length * 5);
  const status = !cartItems.length || missing.length >= 4 ? "blocked" : missing.length ? "needs_details" : "ready";
  const nextAction =
    status === "ready"
      ? "Create the Kapruka pay link"
      : missing[0]
        ? `Collect ${missing[0].toLowerCase()}`
        : "Review delivery and gift message";

  return {
    status,
    score,
    missing,
    warnings,
    nextAction,
  };
}

function productMemory(products: Product[]) {
  return products.slice(0, 6).map((product) => ({
    id: product.id,
    name: product.name,
    category: productCategory(product),
    price: product.price,
  }));
}

function profileFromMemory(memory: {
  recipientKey: string;
  displayName: string;
  occasions: string[];
  preferredCategories: string[];
  deliveryCities: string[];
  minBudget: number | null;
  maxBudget: number | null;
  notes: string[];
}): RecipientMemoryProfile {
  return {
    recipientKey: memory.recipientKey,
    displayName: memory.displayName,
    occasions: memory.occasions,
    preferredCategories: memory.preferredCategories,
    deliveryCities: memory.deliveryCities,
    minBudget: memory.minBudget,
    maxBudget: memory.maxBudget,
    notes: memory.notes,
  };
}

export async function getRecipientMemory(actor: Actor, recipientKey: string | null) {
  if (!recipientKey) return null;
  const where =
    actor.type === "user"
      ? { userId_recipientKey: { userId: actor.userId, recipientKey } }
      : { guestSessionId_recipientKey: { guestSessionId: actor.guestSessionId, recipientKey } };
  const memory = await prisma.recipientMemory.findUnique({ where });
  return memory ? profileFromMemory(memory) : null;
}

export async function rememberRecipient(params: {
  actor: Actor;
  plan: AgentShoppingPlan;
  products: Product[];
  existing?: RecipientMemoryProfile | null;
}) {
  const recipientKey = recipientKeyFromPlan(params.plan);
  if (!recipientKey || !params.plan.recipient) return null;

  const categories = unique(params.products.map(productCategory)).slice(0, 8);
  const occasions = unique([...(params.existing?.occasions ?? []), params.plan.occasion ?? ""]).slice(0, 8);
  const deliveryCities = unique([...(params.existing?.deliveryCities ?? []), params.plan.city ?? ""]).slice(0, 8);
  const preferredCategories = unique([...(params.existing?.preferredCategories ?? []), ...categories]).slice(0, 10);
  const prices = params.products.map((product) => product.price.amount).filter(Number.isFinite);
  const minBudget = params.plan.min_price ?? params.existing?.minBudget ?? (prices.length ? Math.min(...prices) : null);
  const maxBudget = params.plan.max_price ?? params.existing?.maxBudget ?? (prices.length ? Math.max(...prices) : null);
  const notes = unique([
    ...(params.existing?.notes ?? []),
    params.plan.emotional_tone ? `${params.plan.emotional_tone} tone works for this recipient` : "",
  ]).slice(0, 8);
  const data = {
    displayName: compact(params.plan.recipient),
    occasions,
    preferredCategories,
    deliveryCities,
    minBudget: minBudget ? Math.round(minBudget) : null,
    maxBudget: maxBudget ? Math.round(maxBudget) : null,
    lastProducts: productMemory(params.products),
    notes,
  };

  const memory = await prisma.recipientMemory.upsert({
    where:
      params.actor.type === "user"
        ? { userId_recipientKey: { userId: params.actor.userId, recipientKey } }
        : { guestSessionId_recipientKey: { guestSessionId: params.actor.guestSessionId, recipientKey } },
    create: {
      recipientKey,
      ...data,
      ...(params.actor.type === "user" ? { userId: params.actor.userId } : { guestSessionId: params.actor.guestSessionId }),
    },
    update: data,
  });

  return profileFromMemory(memory);
}

export async function buildGiftAgentInsights(params: {
  actor: Actor;
  plan: AgentShoppingPlan;
  products: Product[];
  delivery?: unknown;
  cartSnapshot?: unknown;
  checkout?: CheckoutDraft;
}) {
  const recipientKey = recipientKeyFromPlan(params.plan);
  const existingMemory = await getRecipientMemory(params.actor, recipientKey);
  const bundle = buildBundleRecommendation({
    plan: params.plan,
    products: params.products,
    memory: existingMemory,
  });
  const substitutions = buildSubstitutionSuggestions({
    plan: params.plan,
    products: params.products,
    delivery: params.delivery,
  });
  const checkoutReadiness = buildCheckoutReadiness({
    cartSnapshot: params.cartSnapshot,
    checkout: params.checkout,
    plan: params.plan,
    delivery: params.delivery,
  });
  const recipientMemory = await rememberRecipient({
    actor: params.actor,
    plan: params.plan,
    products: params.products,
    existing: existingMemory,
  });

  return {
    bundle,
    substitutions,
    checkoutReadiness,
    recipientMemory: recipientMemory ?? existingMemory,
  } satisfies GiftAgentInsights;
}
