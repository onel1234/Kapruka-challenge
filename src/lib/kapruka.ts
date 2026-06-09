import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CheckoutPayload, Product } from "@/lib/types";

const MCP_URL = process.env.KAPRUKA_MCP_URL ?? "https://mcp.kapruka.com/mcp";

type ToolResult = {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: {
    result?: unknown;
    [key: string]: unknown;
  };
  isError?: boolean;
};

type SearchResponse = {
  results?: Product[];
  next_cursor?: string | null;
};

async function withKaprukaClient<T>(
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({
    name: "kapruka-gift-concierge",
    version: "0.1.0",
  });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));

  await client.connect(transport);
  try {
    return await run(client);
  } finally {
    await client.close();
  }
}

function parseToolResult<T>(result: ToolResult): T | string {
  const raw = result.structuredContent?.result ?? result.content?.[0]?.text ?? "";

  if (typeof raw !== "string") {
    return raw as T;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw;
  }
}

export async function searchProducts(params: {
  q: string;
  limit?: number;
  min_price?: number | null;
  max_price?: number | null;
  category?: string | null;
  sort?: string;
}) {
  return withKaprukaClient(async (client) => {
    const result = (await client.callTool({
      name: "kapruka_search_products",
      arguments: {
        params: {
          q: params.q,
          limit: params.limit ?? 8,
          min_price: params.min_price ?? null,
          max_price: params.max_price ?? null,
          category: params.category ?? null,
          sort: params.sort ?? "relevance",
          in_stock_only: true,
          include_stubs: false,
          currency: "LKR",
          response_format: "json",
        },
      },
    })) as ToolResult;

    const parsed = parseToolResult<SearchResponse>(result);
    return typeof parsed === "string" ? { results: [], note: parsed } : parsed;
  });
}

export async function listDeliveryCities(query: string) {
  return withKaprukaClient(async (client) => {
    const result = (await client.callTool({
      name: "kapruka_list_delivery_cities",
      arguments: {
        params: {
          query,
          limit: 10,
          response_format: "json",
        },
      },
    })) as ToolResult;

    return parseToolResult(result);
  });
}

export async function checkDelivery(params: {
  city: string;
  delivery_date?: string | null;
  product_id?: string | null;
}) {
  return withKaprukaClient(async (client) => {
    const result = (await client.callTool({
      name: "kapruka_check_delivery",
      arguments: {
        params: {
          city: params.city,
          delivery_date: params.delivery_date ?? null,
          product_id: params.product_id ?? null,
          response_format: "json",
        },
      },
    })) as ToolResult;

    return parseToolResult(result);
  });
}

export async function createOrder(payload: CheckoutPayload) {
  return withKaprukaClient(async (client) => {
    const result = (await client.callTool({
      name: "kapruka_create_order",
      arguments: {
        params: {
          ...payload,
          currency: payload.currency ?? "LKR",
          response_format: "json",
        },
      },
    })) as ToolResult;

    return parseToolResult(result);
  });
}

export async function trackOrder(orderNumber: string) {
  return withKaprukaClient(async (client) => {
    const result = (await client.callTool({
      name: "kapruka_track_order",
      arguments: {
        params: {
          order_number: orderNumber,
          response_format: "json",
        },
      },
    })) as ToolResult;

    return parseToolResult(result);
  });
}
