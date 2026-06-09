export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
};

export type ResponseTone = "warm" | "professional" | "playful" | "concise";
export type EmojiMode = "none" | "light" | "expressive";
export type DetailLevel = "short" | "balanced" | "detailed";

export type ResponsePreferences = {
  tone: ResponseTone;
  emojiMode: EmojiMode;
  detailLevel: DetailLevel;
};

export type Product = {
  id: string;
  name: string;
  summary: string;
  price: {
    amount: number;
    currency: string;
  };
  compare_at_price?: {
    amount: number;
    currency: string;
  } | null;
  in_stock: boolean;
  stock_level?: string | null;
  image_url?: string | null;
  category?: {
    id?: string;
    name?: string;
    slug?: string;
  } | null;
  rating?: number | null;
  ships_internationally?: boolean;
  url?: string;
};

export type CartItem = {
  product: Product;
  quantity: number;
  icingText?: string;
};

export type DeliveryCheck = {
  city?: string;
  delivery_date?: string | null;
  raw: unknown;
};

export type CheckoutPayload = {
  cart: Array<{
    product_id: string;
    quantity: number;
    icing_text?: string | null;
  }>;
  recipient: {
    name: string;
    phone: string;
  };
  delivery: {
    address: string;
    city: string;
    location_type?: string;
    date: string;
    instructions?: string | null;
  };
  sender: {
    name: string;
    anonymous?: boolean;
  };
  gift_message?: string | null;
  currency?: string;
};

export type BundleRecommendation = {
  title: string;
  itemIds: string[];
  total: number;
  currency: string;
  rationale: string;
  missingAddons: string[];
};

export type SubstitutionSuggestion = {
  originalProductId?: string;
  reason: string;
  alternatives: Product[];
};

export type CheckoutReadiness = {
  status: "ready" | "needs_details" | "blocked";
  score: number;
  missing: string[];
  warnings: string[];
  nextAction: string;
};

export type RecipientMemoryProfile = {
  recipientKey: string;
  displayName: string;
  occasions: string[];
  preferredCategories: string[];
  deliveryCities: string[];
  minBudget?: number | null;
  maxBudget?: number | null;
  notes: string[];
};

export type GiftAgentInsights = {
  bundle?: BundleRecommendation | null;
  substitutions: SubstitutionSuggestion[];
  checkoutReadiness: CheckoutReadiness;
  recipientMemory?: RecipientMemoryProfile | null;
};

export type OrderTracking = {
  order_number?: string;
  pnref?: string;
  status?: string;
  status_display?: string;
  order_date?: string;
  delivery_date?: string;
  shipped_date?: string | null;
  amount?: string;
  payment_method?: string;
  comments?: string | null;
  recipient?: {
    name?: string;
    phone?: string;
    address?: string;
    city?: string;
  };
  greeting_message?: string | null;
  special_instructions?: string | null;
  progress?: Array<{
    step?: string;
    timestamp?: string;
  }>;
  live_tracking_available?: boolean;
  has_delivery_video?: boolean;
  has_delivery_photo?: boolean;
  items?: Array<{
    product_id?: string;
    name?: string;
    quantity?: number;
    selling_price?: number;
  }>;
};
