"use client";

import {
  CalendarDays,
  Check,
  Gift,
  Heart,
  Loader2,
  MapPin,
  MessageCircle,
  Minus,
  Plus,
  LogOut,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CartItem, ChatMessage, DeliveryCheck, Product } from "@/lib/types";

type AppLanguage = "english" | "sinhala" | "tamil";

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

type ConversationSummary = {
  id: string;
  title: string;
  language: AppLanguage;
  updatedAt: string;
  messageCount: number;
};

const STARTERS = [
  "Birthday gift for my amma in Kandy under Rs. 10,000",
  "Anniversary surprise with flowers and chocolate for Colombo tomorrow",
  "මට අම්මාට birthday gift එකක් ඕනේ",
  "Build a cute gift bundle for a sister who loves chocolate",
];

const LANGUAGE_OPTIONS: Array<{ value: AppLanguage; label: string }> = [
  { value: "english", label: "English" },
  { value: "sinhala", label: "සිංහල" },
  { value: "tamil", label: "தமிழ்" },
];

const WELCOME_BY_LANGUAGE: Record<AppLanguage, string> = {
  english:
    "Ayubowan. I am Kavi, your Kapruka gift concierge. Tell me who the gift is for, the occasion, budget, and delivery city. I will curate options and help you check out.",
  sinhala:
    "ආයුබෝවන්. මම කවි, ඔබේ Kapruka තෑගි සහායකයා. තෑග්ග කාටද, අවස්ථාව, අයවැය සහ බෙදාහැරීමේ නගරය කියන්න. මම සුදුසු විකල්ප තෝරා දෙන්නම්.",
  tamil:
    "வணக்கம். நான் கவி, உங்கள் Kapruka பரிசு உதவியாளர். பரிசு யாருக்காக, நிகழ்வு, செலவு வரம்பு, விநியோக நகரம் ஆகியவற்றை சொல்லுங்கள். பொருத்தமான தேர்வுகளை நான் பரிந்துரைக்கிறேன்.",
};

function formatPrice(product: Product) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: product.price?.currency ?? "LKR",
    maximumFractionDigits: 0,
  }).format(product.price?.amount ?? 0);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(amount: number, currency = "LKR") {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function isCheckoutSuccess(value: unknown): value is CheckoutSuccess {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<CheckoutSuccess>;
  return Boolean(
    candidate.summary &&
      typeof candidate.summary === "object" &&
      typeof candidate.summary.items_total === "number" &&
      typeof candidate.summary.delivery_fee === "number" &&
      typeof candidate.summary.grand_total === "number" &&
      typeof candidate.summary.currency === "string" &&
      typeof candidate.checkout_url === "string" &&
      typeof candidate.expires_at === "string" &&
      typeof candidate.order_ref === "string",
  );
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
    expires_at?: unknown;
    order_ref?: unknown;
  };
  const summary = candidate.summary;

  if (!summary || typeof candidate.checkout_url !== "string") {
    return null;
  }

  const itemsTotal = toNumber(summary.items_total);
  const deliveryFee = toNumber(summary.delivery_fee);
  const addonsTotal = toNumber(summary.addons_total) ?? 0;
  const grandTotal = toNumber(summary.grand_total);
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
    checkout_url: candidate.checkout_url,
    expires_at: typeof candidate.expires_at === "string" ? candidate.expires_at : new Date().toISOString(),
    order_ref: typeof candidate.order_ref === "string" ? candidate.order_ref : "Pending",
  };
}

function findCheckoutCandidate(value: unknown, depth = 0): CheckoutSuccess | null {
  if (depth > 5 || !value) return null;

  if (typeof value === "string") {
    try {
      return findCheckoutCandidate(JSON.parse(value), depth + 1);
    } catch {
      return null;
    }
  }

  const coerced = coerceCheckoutSuccess(value);
  if (coerced) return coerced;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findCheckoutCandidate(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof value === "object") {
    for (const nested of Object.values(value)) {
      const found = findCheckoutCandidate(nested, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

function normalizeCheckoutSuccess(value: unknown): CheckoutSuccess | null {
  if (typeof value === "string") {
    try {
      return normalizeCheckoutSuccess(JSON.parse(value));
    } catch {
      return null;
    }
  }

  if (isCheckoutSuccess(value)) {
    return value;
  }

  return findCheckoutCandidate(value);
}

export default function Home() {
  const { data: session } = useSession();
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage>("english");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: WELCOME_BY_LANGUAGE.english,
      createdAt: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [delivery, setDelivery] = useState<DeliveryCheck | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkout, setCheckout] = useState({
    recipientName: "",
    recipientPhone: "",
    senderName: "",
    address: "",
    city: "",
    date: todayIso(),
    giftMessage: "",
    instructions: "",
  });
  const [checkoutSuccess, setCheckoutSuccess] = useState<CheckoutSuccess | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const subtotal = useMemo(
    () => cart.reduce((total, item) => total + (item.product.price?.amount ?? 0) * item.quantity, 0),
    [cart],
  );

  async function loadConversations() {
    setIsLoadingConversations(true);
    try {
      const response = await fetch("/api/conversations");
      if (!response.ok) return;
      const data = await response.json();
      setConversations(data.conversations ?? []);
    } finally {
      setIsLoadingConversations(false);
    }
  }

  async function importGuestAndLoadConversations() {
    if (session?.user?.id) {
      await fetch("/api/guest-session/import", { method: "POST" }).catch(() => null);
    }
    await loadConversations();
  }

  useEffect(() => {
    void importGuestAndLoadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  async function startNewConversation() {
    const response = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: selectedLanguage }),
    });
    const data = await response.json();

    if (!response.ok) {
      setCheckoutError(data.error ?? "Could not create a new chat.");
      return;
    }

    setConversationId(data.conversation.id);
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: WELCOME_BY_LANGUAGE[selectedLanguage],
        createdAt: new Date().toISOString(),
      },
    ]);
    setProducts([]);
    setDelivery(null);
    setCart([]);
    await loadConversations();
  }

  async function loadConversation(id: string) {
    const response = await fetch(`/api/conversations/${id}`);
    const data = await response.json();

    if (!response.ok) {
      setCheckoutError(data.error ?? "Could not load chat.");
      return;
    }

    const conversation = data.conversation;
    setConversationId(conversation.id);
    setSelectedLanguage(conversation.language ?? "english");
    setMessages(conversation.messages?.length ? conversation.messages : [
      {
        id: "welcome",
        role: "assistant",
        content: WELCOME_BY_LANGUAGE[conversation.language as AppLanguage] ?? WELCOME_BY_LANGUAGE.english,
        createdAt: new Date().toISOString(),
      },
    ]);
    setProducts(conversation.lastProducts ?? []);
    setDelivery(conversation.lastDelivery ?? null);
    setCart([]);
  }

  async function sendMessage(messageText?: string) {
    const content = (messageText ?? input).trim();
    if (!content || isSending) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setIsSending(true);
    setCheckoutSuccess(null);
    setCheckoutError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          history: messages,
          language: selectedLanguage,
          conversationId,
          cartSnapshot: cart,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "The shopping agent could not respond.");
      }

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply,
        createdAt: new Date().toISOString(),
      };
      setMessages([...nextMessages, assistantMessage]);
      setConversationId(data.conversationId ?? conversationId);
      setProducts(data.products ?? []);
      setDelivery(data.delivery ?? null);
      await loadConversations();

      if (data.plan?.city) {
        setCheckout((current) => ({ ...current, city: data.plan.city }));
      }
      if (data.plan?.delivery_date) {
        setCheckout((current) => ({ ...current, date: data.plan.delivery_date }));
      }
    } catch (error) {
      setMessages([
        ...nextMessages,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "I hit a snag while talking to the shopping tools. Please try again.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  function changeLanguage(language: AppLanguage) {
    setSelectedLanguage(language);
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: WELCOME_BY_LANGUAGE[language],
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  function addToCart(product: Product) {
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (existing) {
        return current.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [...current, { product, quantity: 1 }];
    });
  }

  function updateQuantity(productId: string, change: number) {
    setCart((current) =>
      current
        .map((item) =>
          item.product.id === productId ? { ...item, quantity: Math.max(0, item.quantity + change) } : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  async function submitCheckout() {
    setCheckoutError(null);
    setCheckoutSuccess(null);
    setIsCheckingOut(true);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart: cart.map((item) => ({
            product_id: item.product.id,
            quantity: item.quantity,
            icing_text: item.icingText ?? null,
          })),
          recipient: {
            name: checkout.recipientName,
            phone: checkout.recipientPhone,
          },
          delivery: {
            address: checkout.address,
            city: checkout.city,
            location_type: "house",
            date: checkout.date,
            instructions: checkout.instructions || null,
          },
          sender: {
            name: checkout.senderName,
            anonymous: false,
          },
          gift_message: checkout.giftMessage || null,
          currency: "LKR",
          conversationId,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        const suggestions = Array.isArray(data.suggestions) && data.suggestions.length
          ? ` Try: ${data.suggestions.slice(0, 8).join(", ")}.`
          : "";
        throw new Error(`${data.error ?? "Could not create checkout."}${suggestions}`);
      }

      if (data.normalized_city) {
        setCheckout((current) => ({ ...current, city: data.normalized_city }));
      }
      const normalizedCheckout = normalizeCheckoutSuccess(data.result ?? data);

      if (!normalizedCheckout) {
        throw new Error("Kapruka created a response, but the checkout link format was unexpected.");
      }

      setCheckoutSuccess(normalizedCheckout);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Checkout failed.");
    } finally {
      setIsCheckingOut(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f2e8] text-[#1d1a16]">
      <div className="grid min-h-screen grid-cols-1 xl:grid-cols-[minmax(0,1fr)_430px]">
        <section className="flex min-h-screen flex-col border-r border-[#ded2bd] bg-[#fffaf0]">
          <header className="flex items-center justify-between border-b border-[#eadfc9] px-5 py-4 sm:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#cc2f2f] text-white shadow-sm">
                <Gift size={22} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#85653a]">Kapruka Challenge Demo</p>
                <h1 className="text-xl font-semibold sm:text-2xl">Kavi Gift Concierge</h1>
              </div>
            </div>
            <div className="hidden items-center gap-2 rounded-lg border border-[#eadfc9] bg-white px-3 py-2 text-sm text-[#5d5144] md:flex">
              <Sparkles size={16} className="text-[#cc2f2f]" />
              Sinhala, Tamil, checkout-ready
            </div>
            <label className="flex items-center gap-2 rounded-lg border border-[#eadfc9] bg-white px-3 py-2 text-sm text-[#5d5144]">
              <span className="hidden font-medium sm:inline">Language</span>
              <select
                value={selectedLanguage}
                onChange={(event) => changeLanguage(event.target.value as AppLanguage)}
                className="bg-transparent font-semibold outline-none"
                aria-label="Assistant language"
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {session?.user ? (
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/" })}
                className="hidden h-10 items-center justify-center gap-2 rounded-lg border border-[#eadfc9] bg-white px-3 text-sm font-semibold text-[#5d5144] transition hover:border-[#cc2f2f] hover:text-[#cc2f2f] sm:flex"
              >
                <LogOut size={15} />
                Sign out
              </button>
            ) : null}
          </header>

          <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[250px_minmax(390px,0.88fr)_minmax(360px,1.12fr)]">
            <nav className="border-r border-[#eadfc9] bg-[#f8efe0] p-4">
              <button
                type="button"
                onClick={() => void startNewConversation()}
                className="mb-4 flex h-11 w-full items-center justify-center rounded-lg bg-[#1f4f4a] text-sm font-semibold text-white transition hover:bg-[#173d39]"
              >
                New chat
              </button>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#85653a]">History</p>
                {isLoadingConversations ? <Loader2 size={14} className="animate-spin text-[#85653a]" /> : null}
              </div>
              <div className="space-y-2">
                {conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => void loadConversation(conversation.id)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      conversation.id === conversationId
                        ? "border-[#1f4f4a] bg-white"
                        : "border-[#e2d1b7] bg-white/60 hover:bg-white"
                    }`}
                  >
                    <p className="line-clamp-2 text-sm font-semibold">{conversation.title}</p>
                    <p className="mt-1 text-xs text-[#756650]">{conversation.messageCount} messages</p>
                  </button>
                ))}
                {!conversations.length && !isLoadingConversations ? (
                  <p className="rounded-lg border border-dashed border-[#d7c5aa] p-3 text-sm leading-5 text-[#756650]">
                    Your saved chats will appear here.
                  </p>
                ) : null}
              </div>
            </nav>
            <section className="flex min-h-[58vh] flex-col border-r border-[#eadfc9]">
              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-8">
                {messages.map((message) => (
                  <article
                    key={message.id}
                    className={`max-w-[88%] rounded-lg px-4 py-3 shadow-sm ${
                      message.role === "assistant"
                        ? "bg-white text-[#2c261f]"
                        : "ml-auto bg-[#1f4f4a] text-white"
                    }`}
                  >
                    <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                  </article>
                ))}
                {isSending ? (
                  <div className="flex max-w-[220px] items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm text-[#6c5d4a] shadow-sm">
                    <Loader2 size={16} className="animate-spin" />
                    Searching Kapruka...
                  </div>
                ) : null}
              </div>

              <div className="border-t border-[#eadfc9] bg-[#fffaf0] p-4 sm:p-5">
                <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                  {STARTERS.map((starter) => (
                    <button
                      key={starter}
                      type="button"
                      onClick={() => void sendMessage(starter)}
                      className="shrink-0 rounded-lg border border-[#e3d2b6] bg-white px-3 py-2 text-left text-xs font-medium text-[#5b4a35] transition hover:border-[#cc2f2f] hover:text-[#cc2f2f]"
                    >
                      {starter}
                    </button>
                  ))}
                </div>
                <form onSubmit={handleSubmit} className="flex gap-2">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    className="h-12 min-w-0 flex-1 rounded-lg border border-[#dcc8a8] bg-white px-4 text-sm outline-none transition focus:border-[#cc2f2f] focus:ring-4 focus:ring-[#cc2f2f]/10"
                    placeholder="Ask for a gift, occasion, city, date, or budget..."
                  />
                  <button
                    type="submit"
                    disabled={isSending}
                    className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#cc2f2f] text-white transition hover:bg-[#a92727] disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label="Send message"
                  >
                    {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  </button>
                </form>
              </div>
            </section>

            <section className="min-h-[58vh] overflow-y-auto bg-[#f8efe0] px-5 py-5 sm:px-8">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-[#85653a]">
                    <Search size={16} />
                    Curated Finds
                  </p>
                  <h2 className="text-2xl font-semibold">Gift shelf</h2>
                </div>
                {delivery ? (
                  <div className="rounded-lg border border-[#c7d8cf] bg-[#eef8f2] px-3 py-2 text-xs text-[#24624f]">
                    <MapPin size={14} className="mb-1 inline" /> Delivery checked
                  </div>
                ) : null}
              </div>

              {products.length ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {products.map((product, index) => (
                    <article key={product.id} className="overflow-hidden rounded-lg border border-[#e1cfaf] bg-white shadow-sm">
                      <div className="aspect-[4/3] bg-[#efe1c9]">
                        {product.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[#8a7356]">
                            <Gift size={34} />
                          </div>
                        )}
                      </div>
                      <div className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <span className="rounded-md bg-[#f4d9c8] px-2 py-1 text-xs font-semibold text-[#9b3e25]">
                            {index === 0 ? "Best match" : product.category?.name ?? "Gift"}
                          </span>
                          <span className="text-sm font-bold text-[#1f4f4a]">{formatPrice(product)}</span>
                        </div>
                        <div>
                          <h3 className="line-clamp-2 min-h-10 text-sm font-semibold leading-5">{product.name}</h3>
                          <p className="mt-2 line-clamp-3 text-xs leading-5 text-[#6b5d4c]">{product.summary}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => addToCart(product)}
                            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-[#1f4f4a] px-3 text-sm font-semibold text-white transition hover:bg-[#173d39]"
                          >
                            <ShoppingBag size={15} />
                            Add
                          </button>
                          {product.url ? (
                            <a
                              href={product.url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex h-10 items-center justify-center rounded-lg border border-[#d8c5a7] px-3 text-sm font-semibold text-[#5f503d] transition hover:border-[#1f4f4a]"
                            >
                              View
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-[420px] flex-col items-center justify-center rounded-lg border border-dashed border-[#d7c5aa] bg-[#fffaf0] p-8 text-center">
                  <MessageCircle size={36} className="text-[#cc2f2f]" />
                  <h2 className="mt-4 text-xl font-semibold">Start with a real shopping need</h2>
                  <p className="mt-2 max-w-md text-sm leading-6 text-[#6d5e4b]">
                    Ask for a recipient, occasion, delivery city, and budget. The agent will search live Kapruka products and fill this shelf.
                  </p>
                </div>
              )}
            </section>
          </div>
        </section>

        <aside className="flex min-h-screen flex-col bg-[#1d1a16] text-white">
          <div className="border-b border-white/10 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[#f2c678]">Live Cart</p>
                <h2 className="text-2xl font-semibold">Gift checkout</h2>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10">
                <Heart size={20} />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {cart.length ? (
              <div className="space-y-3">
                {cart.map((item) => (
                  <div key={item.product.id} className="rounded-lg border border-white/10 bg-white/[0.06] p-3">
                    <div className="flex gap-3">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-white/10">
                        {item.product.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.product.image_url} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-semibold">{item.product.name}</p>
                        <p className="mt-1 text-sm text-[#f2c678]">{formatPrice(item.product)}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center rounded-md border border-white/10">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, -1)}
                          className="flex h-8 w-8 items-center justify-center"
                          aria-label="Decrease quantity"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-8 text-center text-sm">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, 1)}
                          className="flex h-8 w-8 items-center justify-center"
                          aria-label="Increase quantity"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.product.id, -item.quantity)}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-white/70 transition hover:bg-white/10 hover:text-white"
                        aria-label="Remove item"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-white/10 bg-white/[0.06] p-5 text-sm leading-6 text-white/70">
                Add products from the gift shelf. When ready, enter delivery details and create a Kapruka pay link.
              </div>
            )}

            <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.06] p-4">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm text-white/70">Subtotal</span>
                <span className="text-xl font-semibold">
                  {new Intl.NumberFormat("en-LK", {
                    style: "currency",
                    currency: "LKR",
                    maximumFractionDigits: 0,
                  }).format(subtotal)}
                </span>
              </div>

              <div className="grid gap-3">
                <input
                  value={checkout.recipientName}
                  onChange={(event) => setCheckout({ ...checkout, recipientName: event.target.value })}
                  className="h-11 rounded-lg border border-white/10 bg-black/20 px-3 text-sm outline-none focus:border-[#f2c678]"
                  placeholder="Recipient name"
                />
                <input
                  value={checkout.recipientPhone}
                  onChange={(event) => setCheckout({ ...checkout, recipientPhone: event.target.value })}
                  className="h-11 rounded-lg border border-white/10 bg-black/20 px-3 text-sm outline-none focus:border-[#f2c678]"
                  placeholder="Recipient phone"
                />
                <input
                  value={checkout.senderName}
                  onChange={(event) => setCheckout({ ...checkout, senderName: event.target.value })}
                  className="h-11 rounded-lg border border-white/10 bg-black/20 px-3 text-sm outline-none focus:border-[#f2c678]"
                  placeholder="Sender name"
                />
                <input
                  value={checkout.address}
                  onChange={(event) => setCheckout({ ...checkout, address: event.target.value })}
                  className="h-11 rounded-lg border border-white/10 bg-black/20 px-3 text-sm outline-none focus:border-[#f2c678]"
                  placeholder="Delivery street address"
                />
                <div className="grid grid-cols-[1fr_145px] gap-2">
                  <div className="relative">
                    <MapPin size={15} className="absolute left-3 top-3.5 text-white/45" />
                    <input
                      value={checkout.city}
                      onChange={(event) => setCheckout({ ...checkout, city: event.target.value })}
                      className="h-11 w-full rounded-lg border border-white/10 bg-black/20 pl-9 pr-3 text-sm outline-none focus:border-[#f2c678]"
                      placeholder="City"
                    />
                  </div>
                  <div className="relative">
                    <CalendarDays size={15} className="absolute left-3 top-3.5 text-white/45" />
                    <input
                      type="date"
                      min={todayIso()}
                      value={checkout.date}
                      onChange={(event) => setCheckout({ ...checkout, date: event.target.value })}
                      className="h-11 w-full rounded-lg border border-white/10 bg-black/20 pl-9 pr-2 text-sm outline-none focus:border-[#f2c678]"
                    />
                  </div>
                </div>
                <textarea
                  value={checkout.giftMessage}
                  onChange={(event) => setCheckout({ ...checkout, giftMessage: event.target.value })}
                  className="min-h-20 resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-3 text-sm outline-none focus:border-[#f2c678]"
                  placeholder="Gift message"
                />
                <textarea
                  value={checkout.instructions}
                  onChange={(event) => setCheckout({ ...checkout, instructions: event.target.value })}
                  className="min-h-16 resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-3 text-sm outline-none focus:border-[#f2c678]"
                  placeholder="Delivery instructions"
                />
              </div>

              <button
                type="button"
                onClick={() => void submitCheckout()}
                disabled={!cart.length || isCheckingOut}
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#f2c678] font-semibold text-[#1d1a16] transition hover:bg-[#ffd98d] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCheckingOut ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}
                Create Kapruka pay link
              </button>

              {checkoutError ? (
                <p className="mt-3 rounded-lg border border-[#ff8f8f]/30 bg-[#7a1f1f]/40 p-3 text-sm text-[#ffd0d0]">
                  {checkoutError}
                </p>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
      {checkoutSuccess ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <section className="w-full max-w-md rounded-lg bg-[#fffaf0] p-5 text-[#1d1a16] shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[#1f7a55]">Checkout link ready</p>
                <h2 className="mt-1 text-2xl font-semibold">Order created successfully</h2>
              </div>
              <button
                type="button"
                onClick={() => setCheckoutSuccess(null)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#dfcdb0] bg-white text-[#5d5144] transition hover:border-[#cc2f2f] hover:text-[#cc2f2f]"
                aria-label="Close checkout summary"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 rounded-lg border border-[#e2d1b7] bg-white p-4">
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[#6b5d4c]">Items total</span>
                  <span className="font-semibold">
                    {formatMoney(checkoutSuccess.summary.items_total, checkoutSuccess.summary.currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6b5d4c]">Shipping price</span>
                  <span className="font-semibold">
                    {formatMoney(checkoutSuccess.summary.delivery_fee, checkoutSuccess.summary.currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-[#eadfc9] pt-3">
                  <span className="font-semibold">Grand total</span>
                  <span className="text-xl font-bold text-[#1f4f4a]">
                    {formatMoney(checkoutSuccess.summary.grand_total, checkoutSuccess.summary.currency)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-lg bg-[#f8efe0] p-3 text-xs leading-5 text-[#6b5d4c]">
              <p>
                Order ref: <span className="font-semibold text-[#1d1a16]">{checkoutSuccess.order_ref}</span>
              </p>
              <p>
                Link expires:{" "}
                <span className="font-semibold text-[#1d1a16]">
                  {new Date(checkoutSuccess.expires_at).toLocaleString("en-LK")}
                </span>
              </p>
            </div>

            <a
              href={checkoutSuccess.checkout_url}
              target="_blank"
              rel="noreferrer"
              className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#cc2f2f] font-semibold text-white transition hover:bg-[#a92727]"
            >
              <ShoppingBag size={17} />
              Go to checkout
            </a>
          </section>
        </div>
      ) : null}
    </main>
  );
}
