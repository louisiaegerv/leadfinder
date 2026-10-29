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

export async function chatJson<T>(o: ChatJsonOpts<T>): Promise<ChatJsonResult<T>> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set. Add it to .env.local and restart.");

  const call = async (format: unknown) => {
    const res = await fetch(`${BASE()}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL(),
        temperature: 0,
        max_tokens: o.maxTokens ?? 2000,
        usage: { include: true },
        response_format: format,
        messages: [
          { role: "system", content: o.system },
          { role: "user", content: o.user },
        ],
      }),
      cache: "no-store",
    });
    return res;
  };

  let res = await call({
    type: "json_schema",
    json_schema: { name: o.schemaName, strict: true, schema: o.jsonSchema },
  });
  // Some models reject json_schema; fall back to plain JSON mode (we validate either way).
  if (res.status === 400) res = await call({ type: "json_object" });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const body = await res.json();
  const content: string | undefined = body?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned no content");
  const data = o.parse.parse(JSON.parse(stripFences(content)));
  return { data, costUsd: typeof body?.usage?.cost === "number" ? body.usage.cost : null, model: MODEL() };
}

function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}
