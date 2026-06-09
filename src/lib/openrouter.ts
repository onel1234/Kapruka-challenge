const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function callOpenRouter(messages: OpenRouterMessage[], maxTokens = 900) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const primaryModel = process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-r1:free";
  const fallbackModels = (process.env.OPENROUTER_FALLBACK_MODELS ?? "openai/gpt-oss-120b:free")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  const models = Array.from(new Set([primaryModel, ...fallbackModels]));
  const failures: string[] = [];

  for (const model of models) {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": process.env.NEXT_PUBLIC_APP_NAME ?? "Kapruka Gift Concierge",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.65,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      failures.push(`${model}: ${response.status}`);
      continue;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (typeof content === "string" && content.trim()) {
      return content.trim();
    }

    failures.push(`${model}: empty text response`);
  }

  throw new Error(`OpenRouter request failed for all configured models (${failures.join(", ")}).`);
}

export function extractJsonObject<T>(text: string): T | null {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
