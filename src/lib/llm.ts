import { z } from "zod";

/**
 * Minimal OpenRouter client (OpenAI-compatible). No tools are ever offered to the
 * model: it can only return JSON that we validate before using.
 */

const BASE = () => process.env.OPENROUTER_API_BASE ?? "https://openrouter.ai/api/v1";
export const MODEL = () => process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4.1-flash";

export type ChatJsonOpts<T> = {
  system: string;
  user: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  parse: z.ZodType<T>;
  maxTokens?: number;
};

export type ChatJsonResult<T> = { data: T; costUsd: number | null; model: string };

/** One way of asking: which output format, and whether to switch the model's hidden thinking off. */
type Attempt = { json: "schema" | "object"; thinkingOff: boolean };

// Reasoning models (DeepSeek and others) spend the token limit on hidden thinking and can run out before they write
// the answer. These are short labelling jobs, so thinking is switched off. Some models or providers reject one setting
// or the other with a 400, so we step down through the combinations rather than fail.
const ATTEMPTS: Attempt[] = [
  { json: "schema", thinkingOff: true },
  { json: "object", thinkingOff: true },
  { json: "schema", thinkingOff: false },
  { json: "object", thinkingOff: false },
];

const MAX_TOKENS_CAP = 16000;

export async function chatJson<T>(o: ChatJsonOpts<T>): Promise<ChatJsonResult<T>> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set. Add it to .env.local and restart.");

  const call = (a: Attempt, maxTokens: number) =>
    fetch(`${BASE()}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL(),
        temperature: 0,
        max_tokens: maxTokens,
        usage: { include: true },
        ...(a.thinkingOff ? { reasoning: { enabled: false } } : {}),
        response_format: a.json === "schema" ? { type: "json_schema", json_schema: { name: o.schemaName, strict: true, schema: o.jsonSchema } } : { type: "json_object" },
        messages: [
          { role: "system", content: o.system },
          { role: "user", content: o.user },
        ],
      }),
      cache: "no-store",
    });

  let maxTokens = o.maxTokens ?? 2000;
  let step = 0;
  let grown = false;
  let spent = 0; // what the attempts that gave no answer already cost
  for (;;) {
    const res = await call(ATTEMPTS[step], maxTokens);
    if (res.status === 400 && step < ATTEMPTS.length - 1) {
      step++;
      continue;
    }
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);

    const body = await res.json();
    // OpenRouter can answer 200 with the upstream provider's error inside.
    if (body?.error) throw new Error(`OpenRouter: ${String(body.error.message ?? JSON.stringify(body.error)).slice(0, 300)}`);
    const choice = body?.choices?.[0];
    const content: string | undefined = choice?.message?.content;
    const cost = typeof body?.usage?.cost === "number" ? body.usage.cost : null;
    if (cost) spent += cost;

    if (!content) {
      // Ran out of room: only possible if the model thinks anyway. Try once more with a much larger limit.
      if (choice?.finish_reason === "length" && !grown) {
        grown = true;
        maxTokens = Math.min(maxTokens * 4, MAX_TOKENS_CAP);
        continue;
      }
      throw new Error(emptyReason(choice, maxTokens));
    }
    const data = o.parse.parse(JSON.parse(stripFences(content)));
    return { data, costUsd: cost == null && spent === 0 ? null : spent, model: MODEL() };
  }
}

/** Say why a reply had no text, in words that point at the fix. */
function emptyReason(choice: { finish_reason?: string; message?: { refusal?: string } } | undefined, maxTokens: number): string {
  const model = MODEL();
  if (choice?.finish_reason === "length") return `OpenRouter returned no answer: ${model} used its whole ${maxTokens}-token limit thinking and never wrote one. Choose a model without forced reasoning in OPENROUTER_MODEL.`;
  if (choice?.message?.refusal) return `OpenRouter: ${model} refused: ${choice.message.refusal.slice(0, 200)}`;
  if (choice?.finish_reason === "content_filter") return `OpenRouter: ${model}'s provider filtered the reply. Try again or choose another model.`;
  return `OpenRouter returned no content from ${model}${choice?.finish_reason ? ` (finish reason: ${choice.finish_reason})` : ""}.`;
}

function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}
