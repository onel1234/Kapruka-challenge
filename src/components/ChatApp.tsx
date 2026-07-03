"use client";

import {
  AlertTriangle,
  Blocks,
  BookUser,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ExternalLink,
  Gift,
  Heart,
  Loader2,
  MapPin,
  Menu,
  MessageCircle,
  Minus,
  PackageCheck,
  Plus,
  RefreshCw,
  LogOut,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  ShoppingBag,
  Sparkles,
  Shuffle,
  Trash2,
  X,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  CartItem,
  ChatMessage,
  CheckoutReadiness,
  DeliveryCheck,
  GiftAgentInsights,
  OrderTracking,
  Product,
  ResponsePreferences,
} from "@/lib/types";

type AppLanguage = "english" | "sinhala" | "singlish" | "tamil" | "tanglish";

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
  "α╢╕α╢º α╢àα╢╕α╖èα╢╕α╖Åα╢º birthday gift α╢æα╢Üα╢Üα╖è α╢òα╢▒α╖Ü",
  "Mata ammata mal gift ekak one Rs. 10,000 aduwen",
  "Amma ku pookal venum Kandy ku Rs. 10,000 kulla",
  "Build a cute gift bundle for a sister who loves chocolate",
];

const LANGUAGE_OPTIONS: Array<{ value: AppLanguage; label: string }> = [
  { value: "english", label: "English" },
  { value: "sinhala", label: "α╖âα╖Æα╢éα╖äα╢╜" },
  { value: "singlish", label: "Singlish" },
  { value: "tamil", label: "α«ñα««α«┐α«┤α»ì" },
  { value: "tanglish", label: "Tanglish" },
];

const TONE_OPTIONS: Array<{ value: ResponsePreferences["tone"]; label: string }> = [
  { value: "warm", label: "Warm" },
  { value: "professional", label: "Professional" },
  { value: "playful", label: "Playful" },
  { value: "concise", label: "Concise" },
];

const EMOJI_OPTIONS: Array<{ value: ResponsePreferences["emojiMode"]; label: string }> = [
  { value: "none", label: "No emojis" },
  { value: "light", label: "Light" },
  { value: "expressive", label: "Expressive" },
];

const DETAIL_OPTIONS: Array<{ value: ResponsePreferences["detailLevel"]; label: string }> = [
  { value: "short", label: "Short" },
  { value: "balanced", label: "Balanced" },
  { value: "detailed", label: "Detailed" },
];

const WELCOME_BY_LANGUAGE: Record<AppLanguage, string> = {
  english:
    "Ayubowan! 🙏✨ Hey there, I'm Kavi — your personal gift-finding buddy! 🎁💛 Tell me who you're shopping for and what the occasion is, and I'll help you find something truly amazing! What's the vibe? 😊",
  sinhala:
    "ආයුබෝවන්! 🙏✨ මම කවි — ඔයාගේ gift-finding buddy! 🎁💛 තෑග්ග කාටද, මොන අවස්ථාවටද කියන්නකෝ, මම ඔයාට සුපිරිම gift එකක් හොයලා දෙන්නම්! 😊",
  singlish:
    "Ayubowan! 🙏✨ Mama Kavi — oyage personal gift-finding buddy! 🎁💛 Gift eka kaatada, occasion eka mokakda kiyannako, mama oyata best eka hoyala dennam! 😊",
  tamil:
    "வணக்கம்! 🙏✨ நான் கவி — உங்கள் personal gift-finding buddy! 🎁💛 பரிசு யாருக்கு, என்ன occasion-ன்னு சொல்லுங்க, நான் அருமையான gift தேடித் தருகிறேன்! 😊",
  tanglish:
    "Vanakkam! 🙏✨ Naan Kavi — unga personal gift-finding buddy! 🎁💛 Gift yaarukku, enna occasion-nu sollunga, naan best option thedi tharen! 😊",
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

function trackingStatusLabel(tracking: OrderTracking) {
  return tracking.status_display ?? tracking.status ?? "Status unavailable";
}

function trackingDateLabel(value?: string | null) {
  return value && value.trim() ? value : "Not available yet";
}

function mergeReadiness(current: GiftAgentInsights | null, checkoutReadiness: CheckoutReadiness): GiftAgentInsights {
  return {
    bundle: current?.bundle ?? null,
    substitutions: current?.substitutions ?? [],
    recipientMemory: current?.recipientMemory ?? null,
    checkoutReadiness,
  };
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isAssistantModalOpen, setIsAssistantModalOpen] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [isTrackOrderModalOpen, setIsTrackOrderModalOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [delivery, setDelivery] = useState<DeliveryCheck | null>(null);
  const [agentInsights, setAgentInsights] = useState<GiftAgentInsights | null>(null);
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
  const [orderNumber, setOrderNumber] = useState("");
  const [orderTracking, setOrderTracking] = useState<OrderTracking | null>(null);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [isTrackingOrder, setIsTrackingOrder] = useState(false);
  const [responsePreferences, setResponsePreferences] = useState<ResponsePreferences>({
    tone: "playful",
    emojiMode: "expressive",
    detailLevel: "balanced",
  });
  const inputRef = useRef<HTMLInputElement>(null);

  const subtotal = useMemo(
    () => cart.reduce((total, item) => total + (item.product.price?.amount ?? 0) * item.quantity, 0),
    [cart],
  );
  const productNamesById = useMemo(
    () => new Map(products.map((product) => [product.id, product.name])),
    [products],
  );
  const bundleProductNames = useMemo(
    () => agentInsights?.bundle?.itemIds.map((id) => productNamesById.get(id) ?? id) ?? [],
    [agentInsights?.bundle?.itemIds, productNamesById],
  );

  async function refreshGuestSession() {
    const response = await fetch("/api/guest-session", { method: "POST" });
    return response.ok;
  }

  async function loadConversations() {
    setIsLoadingConversations(true);
    try {
      let response = await fetch("/api/conversations");

      if (response.status === 401 && !session?.user?.id && (await refreshGuestSession())) {
        response = await fetch("/api/conversations");
      }

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
    const timeoutId = window.setTimeout(() => {
      void importGuestAndLoadConversations();
    }, 0);

    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  async function startNewConversation() {
    const request = () =>
      fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: selectedLanguage }),
      });
    let response = await request();

    if (response.status === 401 && !session?.user?.id && (await refreshGuestSession())) {
      response = await request();
    }

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
    setAgentInsights(null);
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
    setAgentInsights(conversation.agentInsights ?? null);
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
      const chatPayload = {
        message: content,
        history: messages,
        language: selectedLanguage,
        conversationId,
        cartSnapshot: cart,
        responsePreferences,
      };
      const chatRequest = () =>
        fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(chatPayload),
        });
      let response = await chatRequest();

      if (response.status === 401 && !session?.user?.id && (await refreshGuestSession())) {
        response = await chatRequest();
      }

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
      setAgentInsights(data.agentInsights ?? null);
      if (data.agentInsights) {
        try {
          localStorage.setItem("kapruka_agent_insights", JSON.stringify(data.agentInsights));
        } catch {
          // ignore storage errors
        }
      }
      await loadConversations();

      if (
        data.plan?.language === "english" ||
        data.plan?.language === "sinhala" ||
        data.plan?.language === "singlish" ||
        data.plan?.language === "tamil" ||
        data.plan?.language === "tanglish"
      ) {
        setSelectedLanguage(data.plan.language);
      }

      if (data.extractedCheckout) {
        setCheckout((current) => ({
          ...current,
          ...(data.extractedCheckout.recipientName && { recipientName: data.extractedCheckout.recipientName }),
          ...(data.extractedCheckout.recipientPhone && { recipientPhone: data.extractedCheckout.recipientPhone }),
          ...(data.extractedCheckout.senderName && { senderName: data.extractedCheckout.senderName }),
          ...(data.extractedCheckout.address && { address: data.extractedCheckout.address }),
          ...(data.extractedCheckout.city && { city: data.extractedCheckout.city }),
          ...(data.extractedCheckout.date && { date: data.extractedCheckout.date }),
          ...(data.extractedCheckout.giftMessage && { giftMessage: data.extractedCheckout.giftMessage }),
          ...(data.extractedCheckout.instructions && { instructions: data.extractedCheckout.instructions }),
        }));
      } else {
        if (data.plan?.city) {
          setCheckout((current) => ({ ...current, city: data.plan.city }));
        }
        if (data.plan?.delivery_date) {
          setCheckout((current) => ({ ...current, date: data.plan.delivery_date }));
        }
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
              : "Oh no, something went a little sideways on my end! 😅 Could you try that again? I promise I'll get it right this time! 💪✨",
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
    setIsSidebarOpen(true);
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
        if (data.readiness) {
          setAgentInsights((current) => mergeReadiness(current, data.readiness));
        }
        throw new Error(`${data.error ?? "Could not create checkout."}${suggestions}`);
      }

      if (data.normalized_city) {
        setCheckout((current) => ({ ...current, city: data.normalized_city }));
      }
      const normalizedCheckout = normalizeCheckoutSuccess(data.result ?? data);

      if (!normalizedCheckout) {
        throw new Error("Kapruka created a response, but the checkout link format was unexpected.");
      }

      if (data.readiness) {
        setAgentInsights((current) => mergeReadiness(current, data.readiness));
      }
      setCheckoutSuccess(normalizedCheckout);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Checkout failed.");
    } finally {
      setIsCheckingOut(false);
    }
  }

  async function submitOrderTracking() {
    const trimmedOrderNumber = orderNumber.trim();

    setTrackingError(null);
    setOrderTracking(null);

    if (!trimmedOrderNumber) {
      setTrackingError("Enter the paid Kapruka order number from your confirmation email.");
      return;
    }

    setIsTrackingOrder(true);

    try {
      const response = await fetch("/api/orders/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber: trimmedOrderNumber }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Could not track this order.");
      }

      setOrderTracking(data.tracking ?? null);
      if (data.tracking?.order_number) {
        setOrderNumber(data.tracking.order_number);
      }
    } catch (error) {
      setTrackingError(error instanceof Error ? error.message : "Order tracking failed.");
    } finally {
      setIsTrackingOrder(false);
    }
  }

  return (
    
    <main className="flex h-screen overflow-hidden bg-[#f7f2e8] text-[#1d1a16]">
      {/* Sidebar */}
      <aside className={`flex flex-col border-r border-[#ded2bd] bg-[#fffaf0] transition-all duration-300 shrink-0 ${isSidebarOpen ? "w-[340px]" : "w-0 overflow-hidden border-none"}`}>
        <div className="flex-1 overflow-y-auto flex flex-col w-[340px]">
          <header className="flex items-center justify-between p-6 border-b border-[#eadfc9] shrink-0 bg-[#fffdfa]">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#cc2f2f] text-white shadow-sm">
                <Gift size={24} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#85653a] mb-0.5">Kapruka Challenge</p>
                <h1 className="text-base font-bold text-[#2c261f] leading-tight">Gift Concierge</h1>
              </div>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto flex flex-col">
<nav className="bg-transparent border-b border-[#eadfc9] p-4">
              <button
                type="button"
                onClick={() => void startNewConversation()}
                className="mb-8 flex h-12 w-full items-center justify-center rounded-xl bg-[#1f4f4a] text-sm font-bold text-white shadow-sm transition hover:bg-[#173d39] hover:shadow-md"
              >
                <Plus size={18} className="mr-2" />
                New chat
              </button>
              <div className="mb-4 flex items-center justify-between px-1">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a68f70]">History</p>
                {isLoadingConversations ? <Loader2 size={14} className="animate-spin text-[#a68f70]" /> : null}
              </div>
              <div className="space-y-1.5 flex-1 overflow-y-auto pr-1 -mr-1">
                {conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => void loadConversation(conversation.id)}
                    className={`group w-full rounded-xl p-4 text-left transition-all duration-200 ${
                      conversation.id === conversationId
                        ? "bg-white shadow-sm ring-1 ring-[#eadfc9] text-[#2c261f]"
                        : "bg-transparent text-[#6c5d4a] hover:bg-[#f3ebd8] hover:text-[#2c261f]"
                    }`}
                  >
                    <p className="line-clamp-2 text-sm font-bold leading-5">{conversation.title}</p>
                    <p className={`mt-1.5 text-[11px] font-medium transition-colors ${
                      conversation.id === conversationId ? "text-[#85653a]" : "text-[#a68f70] group-hover:text-[#85653a]"
                    }`}>
                      {conversation.messageCount} messages
                    </p>
                  </button>
                ))}
                {!conversations.length && !isLoadingConversations ? (
                  <p className="rounded-xl border border-dashed border-[#d7c5aa] p-4 text-sm leading-5 text-[#85653a] text-center bg-[#fdfaf5]">
                    Your saved chats will appear here.
                  </p>
                ) : null}
              </div>
            </nav>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <section className="flex flex-1 flex-col relative transition-all duration-300">
        <header className="absolute top-0 left-0 right-0 p-4 z-10 flex items-center justify-between pointer-events-none">
          <div className="pointer-events-auto">
            <button type="button" onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm border border-[#eadfc9] text-[#5d5144] hover:border-[#1f4f4a] hover:text-[#1f4f4a] transition-colors">
              <Menu size={20} />
            </button>
          </div>
          <div className="pointer-events-auto flex items-center gap-3">
            <div className="hidden items-center gap-3 lg:flex">
              <a
                href="/agents"
                className="flex items-center gap-2 rounded-lg border border-[#eadfc9] bg-white px-3 py-2 text-sm font-semibold text-[#5d5144] shadow-sm transition hover:border-[#1f4f4a] hover:text-[#1f4f4a]"
              >
                <Blocks size={15} />
                Agent Builder
              </a>
              <div className="flex items-center gap-2 rounded-lg border border-[#eadfc9] bg-[#fffcf8] px-3 py-2 text-sm font-medium text-[#5d5144] shadow-sm">
                <Sparkles size={16} className="text-[#cc2f2f]" />
                Multilingual, checkout-ready
              </div>
            </div>
            <label className="flex items-center gap-2 rounded-lg border border-[#eadfc9] bg-white px-3 py-2 text-sm text-[#5d5144] shadow-sm cursor-pointer hover:border-[#1f4f4a] transition-colors">
              <span className="hidden font-medium sm:inline">Language</span>
              <select
                value={selectedLanguage}
                onChange={(event) => changeLanguage(event.target.value as AppLanguage)}
                className="bg-transparent font-semibold outline-none cursor-pointer"
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
                className="hidden h-10 items-center justify-center gap-2 rounded-lg border border-[#eadfc9] bg-white px-3 text-sm font-semibold text-[#5d5144] shadow-sm transition hover:border-[#cc2f2f] hover:text-[#cc2f2f] sm:flex"
              >
                <LogOut size={15} />
                <span className="hidden md:inline">Sign out</span>
              </button>
            ) : null}
            <button type="button" onClick={() => setIsAssistantModalOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm border border-[#eadfc9] text-[#5d5144] hover:border-[#1f4f4a] hover:text-[#1f4f4a] transition-colors" title="Assistant Style">
              <SlidersHorizontal size={20} />
            </button>
            <button type="button" onClick={() => setIsCheckoutModalOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm border border-[#eadfc9] text-[#5d5144] hover:border-[#1f4f4a] hover:text-[#1f4f4a] transition-colors" title="Live Cart & Checkout">
              <ShoppingBag size={20} />
            </button>
            <button type="button" onClick={() => setIsTrackOrderModalOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm border border-[#eadfc9] text-[#5d5144] hover:border-[#1f4f4a] hover:text-[#1f4f4a] transition-colors" title="Track Order">
              <PackageCheck size={20} />
            </button>
            <button type="button" onClick={() => setIsDrawerOpen(!isDrawerOpen)} className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm border border-[#eadfc9] text-[#5d5144] hover:border-[#1f4f4a] hover:text-[#1f4f4a] transition-colors">
              {isDrawerOpen ? <PanelRightClose size={20} /> : <PanelRightOpen size={20} />}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto pt-20 pb-40">
          <div className="mx-auto max-w-4xl px-4 flex flex-col gap-6">
            <div className="flex flex-col items-center justify-center mt-8 mb-12">
               <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#cc2f2f] text-white shadow-md mb-4">
                 <Gift size={28} />
               </div>
               <h1 className="text-3xl font-bold text-[#2c261f]">Ask away!</h1>
               <p className="mt-2 text-[#6c5d4a]">I&apos;m Kavi, your Kapruka gift concierge.</p>
            </div>
<div className="space-y-6">
                {messages.map((message, idx) => {
                  const isLastAssistantMessage = message.role === "assistant" && idx === messages.length - 1;
                  return (
                  <div key={message.id} className={`flex flex-col ${message.role === 'assistant' ? 'items-start' : 'items-end'}`}>
                    <article
                      className={`max-w-[88%] rounded-lg px-4 py-3 shadow-sm ${
                        message.role === "assistant"
                          ? "bg-white text-[#2c261f]"
                          : "bg-[#1f4f4a] text-white"
                      }`}
                    >
                      <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                    </article>
                    {isLastAssistantMessage && products.length > 0 && (
                      <div className="mt-4 flex gap-3 w-full overflow-x-auto pb-4 pl-1 scrollbar-hide">
                         {products.slice(0, 4).map((product, pIdx) => (
                           <div key={product.id} className="min-w-[220px] w-[220px] shrink-0 overflow-hidden rounded-lg border border-[#e1cfaf] bg-white shadow-sm flex flex-col transition hover:shadow-md">
                             <div className="aspect-[4/3] bg-[#efe1c9]">
                               {product.image_url ? (
                                 <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                               ) : (
                                 <div className="flex h-full items-center justify-center text-[#8a7356]">
                                   <Gift size={24} />
                                 </div>
                               )}
                             </div>
                             <div className="p-3 flex-1 flex flex-col">
                               <div className="flex items-start justify-between gap-2 mb-2">
                                 <span className="rounded-md bg-[#f4d9c8] px-1.5 py-0.5 text-[10px] font-semibold text-[#9b3e25] truncate">
                                   {pIdx === 0 ? "Best match" : product.category?.name ?? "Gift"}
                                 </span>
                                 <span className="text-xs font-bold text-[#1f4f4a]">{formatPrice(product)}</span>
                               </div>
                               <h3 className="line-clamp-2 text-xs font-semibold leading-4 mb-3 flex-1">{product.name}</h3>
                               <button
                                 type="button"
                                 onClick={() => addToCart(product)}
                                 className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-[#1f4f4a] px-2 text-xs font-semibold text-white transition hover:bg-[#173d39]"
                               >
                                 <ShoppingBag size={14} />
                                 Add
                               </button>
                             </div>
                           </div>
                         ))}
                         <button type="button" onClick={() => setIsDrawerOpen(true)} className="min-w-[140px] shrink-0 flex flex-col items-center justify-center rounded-lg border border-dashed border-[#d8c5a7] bg-[#fffaf0] text-[#5f503d] hover:border-[#1f4f4a] hover:text-[#1f4f4a] transition">
                           <ChevronRight size={28} className="mb-2" />
                           <span className="text-sm font-semibold">View all {products.length}</span>
                         </button>
                      </div>
                    )}
                  </div>
                )})}
                {isSending ? (
                  <div className="flex max-w-[220px] items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm text-[#6c5d4a] shadow-sm">
                    <Loader2 size={16} className="animate-spin" />
                    Searching Kapruka...
                  </div>
                ) : null}
              </div>
          </div>
        </div>

        <div className="absolute bottom-6 left-0 right-0 px-4 pointer-events-none">
          <div className="mx-auto max-w-4xl pointer-events-auto">
             <div className="bg-white rounded-2xl shadow-xl border border-[#eadfc9] overflow-hidden">
<div className="p-3">
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
             </div>
          </div>
        </div>
      </section>

      {/* Right Drawer */}
      <aside className={`bg-[#fffaf0] border-l border-[#ded2bd] transition-all duration-300 shrink-0 ${isDrawerOpen ? "w-[450px]" : "w-0 overflow-hidden border-none"}`}>
        <div className="h-full overflow-y-auto w-[450px]">
<section className=" overflow-y-auto bg-[#f8efe0] px-5 py-5 sm:px-8">
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
                <>
                  {agentInsights ? (
                    <section className="mb-5">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#85653a]">Agent decisions</p>
                          <h3 className="text-lg font-semibold">Active agents</h3>
                        </div>
                        <a
                          href="/agents"
                          className="flex items-center gap-1 rounded-md border border-[#d8c5a7] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#5d5144] transition hover:border-[#1f4f4a] hover:text-[#1f4f4a]"
                        >
                          <ExternalLink size={12} />
                          Inspector
                        </a>
                      </div>

                      <div className="grid gap-3">
                        {/* ΓöÇΓöÇ Bundle Builder ΓöÇΓöÇ */}
                        <div className="overflow-hidden rounded-xl border border-[#e1cfaf] bg-white shadow-sm">
                          <div className="flex items-center gap-3 border-b border-[#f0e4cc] bg-[#fffbf5] px-4 py-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1f4f4a]/10">
                              <Blocks size={16} className="text-[#1f4f4a]" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-[#1d1a16]">Bundle Builder</p>
                              <p className="text-xs text-[#85653a]">
                                {agentInsights.bundle ? `${agentInsights.bundle.itemIds.length} items curated` : "No bundle yet"}
                              </p>
                            </div>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                agentInsights.bundle
                                  ? "bg-[#e8f5f1] text-[#1f7a55]"
                                  : "bg-[#f0e4cc] text-[#85653a]"
                              }`}
                            >
                              {agentInsights.bundle ? "active" : "idle"}
                            </span>
                          </div>
                          {agentInsights.bundle ? (
                            <div className="px-4 py-3">
                              <p className="text-sm font-semibold text-[#1d1a16]">{agentInsights.bundle.title}</p>
                              <p className="mt-1 text-xs text-[#756650]">{agentInsights.bundle.rationale}</p>
                              <div className="mt-3 space-y-1.5">
                                {bundleProductNames.map((name, i) => (
                                  <div key={i} className="flex items-center gap-2 text-xs">
                                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#1f4f4a]" />
                                    <span className="flex-1 truncate text-[#3a3028]">{name}</span>
                                  </div>
                                ))}
                              </div>
                              {agentInsights.bundle.missingAddons.length > 0 && (
                                <p className="mt-2 text-xs text-[#a06030]">
                                  Could add: {agentInsights.bundle.missingAddons.join(", ")}
                                </p>
                              )}
                              <div className="mt-3 flex items-center justify-between">
                                <span className="text-sm font-bold text-[#1f4f4a]">
                                  {formatMoney(agentInsights.bundle.total, agentInsights.bundle.currency)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    agentInsights.bundle!.itemIds.forEach((id) => {
                                      const product = products.find((p) => p.id === id);
                                      if (product) addToCart(product);
                                    });
                                  }}
                                  className="flex items-center gap-1.5 rounded-lg bg-[#1f4f4a] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#173d39]"
                                >
                                  <Plus size={12} />
                                  Add bundle
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="px-4 py-3 text-xs text-[#9a8878]">
                              Ask for a gift ΓÇö the Bundle Builder will curate items from the shelf.
                            </p>
                          )}
                        </div>

                        {/* ΓöÇΓöÇ Checkout Readiness ΓöÇΓöÇ */}
                        <div className="overflow-hidden rounded-xl border border-[#e1cfaf] bg-white shadow-sm">
                          <div className="flex items-center gap-3 border-b border-[#f0e4cc] bg-[#fffbf5] px-4 py-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#cc2f2f]/10">
                              <ShieldCheck size={16} className="text-[#cc2f2f]" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-[#1d1a16]">Checkout Readiness</p>
                              <p className="text-xs text-[#85653a]">{agentInsights.checkoutReadiness.nextAction}</p>
                            </div>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                agentInsights.checkoutReadiness.status === "ready"
                                  ? "bg-[#e8f5f1] text-[#1f7a55]"
                                  : agentInsights.checkoutReadiness.status === "needs_details"
                                    ? "bg-[#fff3cd] text-[#856404]"
                                    : "bg-[#fde8e8] text-[#842029]"
                              }`}
                            >
                              {agentInsights.checkoutReadiness.status.replace("_", " ")}
                            </span>
                          </div>
                          <div className="px-4 py-3">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-[#756650]">Readiness score</span>
                              <span className="font-bold text-[#1d1a16]">{agentInsights.checkoutReadiness.score}%</span>
                            </div>
                            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#f0e4cc]">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${agentInsights.checkoutReadiness.score}%`,
                                  background:
                                    agentInsights.checkoutReadiness.score >= 80
                                      ? "#1f7a55"
                                      : agentInsights.checkoutReadiness.score >= 50
                                        ? "#d97706"
                                        : "#cc2f2f",
                                }}
                              />
                            </div>
                            {agentInsights.checkoutReadiness.missing.length > 0 && (
                              <ul className="mt-3 space-y-1">
                                {agentInsights.checkoutReadiness.missing.map((item) => (
                                  <li key={item} className="flex items-center gap-2 text-xs text-[#9b3e25]">
                                    <CircleDot size={11} className="shrink-0" />
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {agentInsights.checkoutReadiness.warnings.length > 0 && (
                              <ul className="mt-2 space-y-1">
                                {agentInsights.checkoutReadiness.warnings.map((warning) => (
                                  <li key={warning} className="flex items-start gap-2 text-xs text-[#a06030]">
                                    <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                                    {warning}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {agentInsights.checkoutReadiness.status === "ready" && (
                              <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[#1f7a55]">
                                <CheckCircle2 size={13} />
                                Ready to create checkout link
                              </div>
                            )}
                          </div>
                        </div>

                        {/* ΓöÇΓöÇ Substitution Agent ΓöÇΓöÇ */}
                        <div className="overflow-hidden rounded-xl border border-[#e1cfaf] bg-white shadow-sm">
                          <div className="flex items-center gap-3 border-b border-[#f0e4cc] bg-[#fffbf5] px-4 py-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#7c3aed]/10">
                              <Shuffle size={16} className="text-[#7c3aed]" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-[#1d1a16]">Substitution Agent</p>
                              <p className="text-xs text-[#85653a]">
                                {agentInsights.substitutions.length
                                  ? `${agentInsights.substitutions.length} substitution${agentInsights.substitutions.length > 1 ? "s" : ""} found`
                                  : "All products available"}
                              </p>
                            </div>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                agentInsights.substitutions.length
                                  ? "bg-[#f3e8ff] text-[#7c3aed]"
                                  : "bg-[#e8f5f1] text-[#1f7a55]"
                              }`}
                            >
                              {agentInsights.substitutions.length ? "flagged" : "clear"}
                            </span>
                          </div>
                          {agentInsights.substitutions.length > 0 ? (
                            <div className="divide-y divide-[#f0e4cc] px-4">
                              {agentInsights.substitutions.slice(0, 2).map((sub, i) => (
                                <div key={i} className="py-3">
                                  <p className="text-xs text-[#9b3e25]">{sub.reason}</p>
                                  <div className="mt-2 space-y-1.5">
                                    {sub.alternatives.slice(0, 3).map((alt) => (
                                      <div key={alt.id} className="flex items-center justify-between gap-2">
                                        <span className="min-w-0 truncate text-xs text-[#3a3028]">{alt.name}</span>
                                        <div className="flex shrink-0 items-center gap-1.5">
                                          <span className="text-xs font-semibold text-[#1f4f4a]">{formatPrice(alt)}</span>
                                          <button
                                            type="button"
                                            onClick={() => addToCart(alt)}
                                            className="flex h-6 w-6 items-center justify-center rounded-md bg-[#1f4f4a] text-white transition hover:bg-[#173d39]"
                                            aria-label={`Add ${alt.name} to cart`}
                                          >
                                            <Plus size={11} />
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="px-4 py-3 text-xs text-[#9a8878]">
                              All shelf items are in-stock and within budget. No swaps needed.
                            </p>
                          )}
                        </div>

                        {/* ΓöÇΓöÇ Recipient Memory ΓöÇΓöÇ */}
                        <div className="overflow-hidden rounded-xl border border-[#e1cfaf] bg-white shadow-sm">
                          <div className="flex items-center gap-3 border-b border-[#f0e4cc] bg-[#fffbf5] px-4 py-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#d97706]/10">
                              <BookUser size={16} className="text-[#d97706]" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-[#1d1a16]">Recipient Memory</p>
                              <p className="text-xs text-[#85653a]">
                                {agentInsights.recipientMemory ? `Profile for ${agentInsights.recipientMemory.displayName}` : "No profile yet"}
                              </p>
                            </div>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                agentInsights.recipientMemory
                                  ? "bg-[#fef3c7] text-[#92400e]"
                                  : "bg-[#f0e4cc] text-[#85653a]"
                              }`}
                            >
                              {agentInsights.recipientMemory ? "remembered" : "new"}
                            </span>
                          </div>
                          {agentInsights.recipientMemory ? (
                            <div className="px-4 py-3">
                              <p className="text-sm font-semibold text-[#1d1a16]">{agentInsights.recipientMemory.displayName}</p>
                              {agentInsights.recipientMemory.preferredCategories.length > 0 && (
                                <div className="mt-2">
                                  <p className="mb-1.5 text-xs text-[#756650]">Likes</p>
                                  <div className="flex flex-wrap gap-1">
                                    {agentInsights.recipientMemory.preferredCategories.slice(0, 6).map((cat) => (
                                      <span key={cat} className="rounded-full bg-[#fef3c7] px-2.5 py-0.5 text-xs font-medium text-[#92400e]">
                                        {cat}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {agentInsights.recipientMemory.occasions.filter(Boolean).length > 0 && (
                                <div className="mt-2">
                                  <p className="mb-1.5 text-xs text-[#756650]">Occasions</p>
                                  <div className="flex flex-wrap gap-1">
                                    {agentInsights.recipientMemory.occasions.filter(Boolean).slice(0, 4).map((occ) => (
                                      <span key={occ} className="rounded-full bg-[#e8f5f1] px-2.5 py-0.5 text-xs font-medium text-[#1f7a55]">
                                        {occ}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {agentInsights.recipientMemory.deliveryCities.filter(Boolean).length > 0 && (
                                <div className="mt-2 flex items-center gap-1.5 text-xs text-[#756650]">
                                  <MapPin size={11} />
                                  {agentInsights.recipientMemory.deliveryCities.filter(Boolean).join(", ")}
                                </div>
                              )}
                              {(agentInsights.recipientMemory.minBudget || agentInsights.recipientMemory.maxBudget) && (
                                <div className="mt-1 text-xs text-[#756650]">
                                  Budget range:{" "}
                                  <span className="font-semibold text-[#1d1a16]">
                                    {agentInsights.recipientMemory.minBudget
                                      ? formatMoney(agentInsights.recipientMemory.minBudget)
                                      : ""}
                                    {agentInsights.recipientMemory.minBudget && agentInsights.recipientMemory.maxBudget ? " ΓÇô " : ""}
                                    {agentInsights.recipientMemory.maxBudget
                                      ? formatMoney(agentInsights.recipientMemory.maxBudget)
                                      : ""}
                                  </span>
                                </div>
                              )}
                              {agentInsights.recipientMemory.notes.filter(Boolean).length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {agentInsights.recipientMemory.notes.filter(Boolean).slice(0, 3).map((note) => (
                                    <div key={note} className="flex items-start gap-1.5 text-xs text-[#756650]">
                                      <ChevronRight size={10} className="mt-0.5 shrink-0 text-[#85653a]" />
                                      {note}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="px-4 py-3 text-xs text-[#9a8878]">
                              Name a specific recipient in your request and Kavi will remember their preferences.
                            </p>
                          )}
                        </div>
                      </div>
                    </section>
                  ) : null}
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
                </>
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
      </aside>

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
                Checkout ref: <span className="font-semibold text-[#1d1a16]">{checkoutSuccess.order_ref}</span>
              </p>
              <p>
                Link expires:{" "}
                <span className="font-semibold text-[#1d1a16]">
                  {new Date(checkoutSuccess.expires_at).toLocaleString("en-LK")}
                </span>
              </p>
              <p className="mt-2">
                After payment, use the Kapruka order number from the confirmation email to track delivery.
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
      
      {isAssistantModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-[#fffaf0] text-[#1d1a16] shadow-2xl border border-[#eadfc9]">
            <button 
              onClick={() => setIsAssistantModalOpen(false)}
              className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-lg bg-#1d1a16 shadow-sm border border-[#eadfc9] text-[#5d5144] hover:border-[#1f4f4a] hover:text-[#1f4f4a] transition-colors z-10"
            >
              <X size={18} />
            </button>
            <div className="p-5 pt-14">
              <div className="mb-5 rounded-lg border border-[#eadfc9] bg-#1d1a16 shadow-sm p-4">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#fffcf8] text-[#85653a] border border-[#eadfc9] shadow-sm">
                  <SlidersHorizontal size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#85653a]">Assistant style</p>
                  <p className="mt-1 text-xs text-[#6c5d4a]">
                    {TONE_OPTIONS.find((option) => option.value === responsePreferences.tone)?.label} tone
                  </p>
                </div>
              </div>

              <div className="grid gap-3">
                <label className="grid gap-1 text-xs text-[#6c5d4a]">
                  Tone
                  <select
                    value={responsePreferences.tone}
                    onChange={(event) =>
                      setResponsePreferences((current) => ({
                        ...current,
                        tone: event.target.value as ResponsePreferences["tone"],
                      }))
                    }
                    className="h-10 rounded-lg border border-[#eadfc9] bg-transparent text-[#2c261f] px-3 text-sm font-semibold text-[#1d1a16] outline-none focus:border-[#1f4f4a]"
                  >
                    {TONE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-xs text-[#6c5d4a]">
                    Emoji use
                    <select
                      value={responsePreferences.emojiMode}
                      onChange={(event) =>
                        setResponsePreferences((current) => ({
                          ...current,
                          emojiMode: event.target.value as ResponsePreferences["emojiMode"],
                        }))
                      }
                      className="h-10 rounded-lg border border-[#eadfc9] bg-transparent text-[#2c261f] px-3 text-sm font-semibold text-[#1d1a16] outline-none focus:border-[#1f4f4a]"
                    >
                      {EMOJI_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1 text-xs text-[#6c5d4a]">
                    Detail
                    <select
                      value={responsePreferences.detailLevel}
                      onChange={(event) =>
                        setResponsePreferences((current) => ({
                          ...current,
                          detailLevel: event.target.value as ResponsePreferences["detailLevel"],
                        }))
                      }
                      className="h-10 rounded-lg border border-[#eadfc9] bg-transparent text-[#2c261f] px-3 text-sm font-semibold text-[#1d1a16] outline-none focus:border-[#1f4f4a]"
                    >
                      {DETAIL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>
      )}

      {isCheckoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-[#fffaf0] text-[#1d1a16] shadow-2xl border border-[#eadfc9]">
            <button 
              onClick={() => setIsCheckoutModalOpen(false)}
              className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-lg bg-#1d1a16 shadow-sm border border-[#eadfc9] text-[#5d5144] hover:border-[#1f4f4a] hover:text-[#1f4f4a] transition-colors z-10"
            >
              <X size={18} />
            </button>
            <div className="border-b border-[#eadfc9] p-5 pt-8 pr-14">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[#85653a]">Live Cart</p>
                <h2 className="text-2xl font-semibold">Gift checkout</h2>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#cc2f2f] text-white shadow-sm">
                <Heart size={20} />
              </div>
            </div>
          </div>
            <div className="p-5">
              {cart.length ? (
              <div className="space-y-3">
                {cart.map((item) => (
                  <div key={item.product.id} className="rounded-lg border border-[#eadfc9] bg-#1d1a16 shadow-sm p-3">
                    <div className="flex gap-3">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-white/10">
                        {item.product.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.product.image_url} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-semibold">{item.product.name}</p>
                        <p className="mt-1 text-sm text-[#85653a]">{formatPrice(item.product)}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center rounded-md border border-[#eadfc9]">
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
                        className="flex h-8 w-8 items-center justify-center rounded-md text-[#6c5d4a] transition hover:bg-white/10 hover:text-white"
                        aria-label="Remove item"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-[#eadfc9] bg-#1d1a16 shadow-sm p-5 text-sm leading-6 text-[#6c5d4a]">
                Add products from the gift shelf. When ready, enter delivery details and create a Kapruka pay link.
              </div>
            )}

            <div className="mt-5 rounded-lg border border-[#eadfc9] bg-#1d1a16 shadow-sm p-4">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm text-[#6c5d4a]">Subtotal</span>
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
                  className="h-11 rounded-lg border border-[#eadfc9] bg-transparent text-[#2c261f] px-3 text-sm outline-none focus:border-[#1f4f4a]"
                  placeholder="Recipient name"
                />
                <input
                  value={checkout.recipientPhone}
                  onChange={(event) => setCheckout({ ...checkout, recipientPhone: event.target.value })}
                  className="h-11 rounded-lg border border-[#eadfc9] bg-transparent text-[#2c261f] px-3 text-sm outline-none focus:border-[#1f4f4a]"
                  placeholder="Recipient phone"
                />
                <input
                  value={checkout.senderName}
                  onChange={(event) => setCheckout({ ...checkout, senderName: event.target.value })}
                  className="h-11 rounded-lg border border-[#eadfc9] bg-transparent text-[#2c261f] px-3 text-sm outline-none focus:border-[#1f4f4a]"
                  placeholder="Sender name"
                />
                <input
                  value={checkout.address}
                  onChange={(event) => setCheckout({ ...checkout, address: event.target.value })}
                  className="h-11 rounded-lg border border-[#eadfc9] bg-transparent text-[#2c261f] px-3 text-sm outline-none focus:border-[#1f4f4a]"
                  placeholder="Delivery street address"
                />
                <div className="grid grid-cols-[1fr_145px] gap-2">
                  <div className="relative">
                    <MapPin size={15} className="absolute left-3 top-3.5 text-[#a68f70]" />
                    <input
                      value={checkout.city}
                      onChange={(event) => setCheckout({ ...checkout, city: event.target.value })}
                      className="h-11 w-full rounded-lg border border-[#eadfc9] bg-transparent text-[#2c261f] pl-9 pr-3 text-sm outline-none focus:border-[#1f4f4a]"
                      placeholder="City"
                    />
                  </div>
                  <div className="relative">
                    <CalendarDays size={15} className="absolute left-3 top-3.5 text-[#a68f70]" />
                    <input
                      type="date"
                      min={todayIso()}
                      value={checkout.date}
                      onChange={(event) => setCheckout({ ...checkout, date: event.target.value })}
                      className="h-11 w-full rounded-lg border border-[#eadfc9] bg-transparent text-[#2c261f] pl-9 pr-2 text-sm outline-none focus:border-[#1f4f4a]"
                    />
                  </div>
                </div>
                <textarea
                  value={checkout.giftMessage}
                  onChange={(event) => setCheckout({ ...checkout, giftMessage: event.target.value })}
                  className="min-h-20 resize-none rounded-lg border border-[#eadfc9] bg-transparent text-[#2c261f] px-3 py-3 text-sm outline-none focus:border-[#1f4f4a]"
                  placeholder="Gift message"
                />
                <textarea
                  value={checkout.instructions}
                  onChange={(event) => setCheckout({ ...checkout, instructions: event.target.value })}
                  className="min-h-16 resize-none rounded-lg border border-[#eadfc9] bg-transparent text-[#2c261f] px-3 py-3 text-sm outline-none focus:border-[#1f4f4a]"
                  placeholder="Delivery instructions"
                />
              </div>

              <button
                type="button"
                onClick={() => void submitCheckout()}
                disabled={!cart.length || isCheckingOut}
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#1f4f4a] font-semibold text-[#1d1a16] transition hover:bg-[#173d39] disabled:cursor-not-allowed disabled:opacity-50"
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
          </div>
        </div>
      )}

      {isTrackOrderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-[#fffaf0] text-[#1d1a16] shadow-2xl border border-[#eadfc9]">
            <button 
              onClick={() => setIsTrackOrderModalOpen(false)}
              className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-lg bg-#1d1a16 shadow-sm border border-[#eadfc9] text-[#5d5144] hover:border-[#1f4f4a] hover:text-[#1f4f4a] transition-colors z-10"
            >
              <X size={18} />
            </button>
            <div className="p-5 pt-14">
              <form
              onSubmit={(event) => {
                event.preventDefault();
                void submitOrderTracking();
              }}
              className="mt-0 rounded-lg border border-[#eadfc9] bg-#1d1a16 shadow-sm p-4"
            >
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#fffcf8] text-[#85653a] border border-[#eadfc9] shadow-sm">
                  <PackageCheck size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#85653a]">Track paid order</p>
                  <p className="mt-1 text-xs leading-5 text-[#6c5d4a]">
                    Use the Kapruka order number from the payment confirmation, not the checkout ref.
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  value={orderNumber}
                  onChange={(event) => setOrderNumber(event.target.value)}
                  className="h-11 min-w-0 flex-1 rounded-lg border border-[#eadfc9] bg-transparent text-[#2c261f] px-3 text-sm uppercase outline-none focus:border-[#1f4f4a]"
                  placeholder="VIMP34456CB2"
                />
                <button
                  type="submit"
                  disabled={isTrackingOrder}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#1f4f4a] text-white transition hover:bg-[#173d39] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Track order"
                >
                  {isTrackingOrder ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
                </button>
              </div>

              {trackingError ? (
                <p className="mt-3 rounded-lg border border-[#ff8f8f]/30 bg-[#7a1f1f]/40 p-3 text-sm text-[#ffd0d0]">
                  {trackingError}
                </p>
              ) : null}

              {orderTracking ? (
                <div className="mt-4 rounded-lg border border-[#eadfc9] bg-transparent text-[#2c261f] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-[#6c5d4a]">Current status</p>
                      <p className="mt-1 text-lg font-semibold text-[#1d1a16]">{trackingStatusLabel(orderTracking)}</p>
                    </div>
                    <span className="rounded-md bg-[#1f7a55]/25 px-2 py-1 text-xs font-semibold text-[#9ff0ca]">
                      {orderTracking.order_number ?? orderNumber.trim().toUpperCase()}
                    </span>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <dt className="text-[#a68f70]">Delivery date</dt>
                      <dd className="mt-1 font-semibold text-[#1d1a16]">{trackingDateLabel(orderTracking.delivery_date)}</dd>
                    </div>
                    <div>
                      <dt className="text-[#a68f70]">Amount</dt>
                      <dd className="mt-1 font-semibold text-[#1d1a16]">{orderTracking.amount ?? "Not available"}</dd>
                    </div>
                    <div>
                      <dt className="text-[#a68f70]">Recipient</dt>
                      <dd className="mt-1 truncate font-semibold text-[#1d1a16]">
                        {orderTracking.recipient?.name ?? "Not available"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#a68f70]">City</dt>
                      <dd className="mt-1 truncate font-semibold text-[#1d1a16]">
                        {orderTracking.recipient?.city ?? "Not available"}
                      </dd>
                    </div>
                  </dl>

                  {orderTracking.progress?.length ? (
                    <div className="mt-4 border-t border-[#eadfc9] pt-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a68f70]">Progress</p>
                      <div className="mt-3 space-y-2">
                        {orderTracking.progress.slice(0, 5).map((step, index) => (
                          <div key={`${step.step ?? "step"}-${index}`} className="flex gap-2 text-xs">
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#f2c678]" />
                            <div>
                              <p className="font-semibold text-[#1d1a16]">{step.step ?? "Update"}</p>
                              {step.timestamp ? <p className="mt-0.5 text-[#a68f70]">{step.timestamp}</p> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </form>
            </div>
          </div>
        </div>
      )}
    </main>

  );
}
