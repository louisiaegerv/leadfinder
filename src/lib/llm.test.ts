import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const opts = {
  system: "s",
  user: "u",
  schemaName: "x",
  jsonSchema: { type: "object" },
  parse: z.object({ ok: z.boolean() }),
  maxTokens: 2500,
};

type Sent = { reasoning?: { enabled: boolean }; max_tokens: number; response_format: { type: string } };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const good = (cost = 0.0004) => reply({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }], usage: { cost } });
const outOfRoom = (cost = 0.0017) => reply({ choices: [{ message: { content: null, reasoning: "thinking..." }, finish_reason: "length" }], usage: { cost } });

describe("chatJson", () => {
  let chatJson: typeof import("./llm").chatJson;
  let sent: Sent[];
  let replies: Response[];

  beforeEach(async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    ({ chatJson } = await import("./llm"));
    sent = [];
    replies = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      const next = replies.shift();
      if (!next) throw new Error("unexpected extra request");
      return next;
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("switches the model's hidden thinking off, so a reasoning model cannot spend the whole limit before answering", async () => {
    replies = [good()];
    const r = await chatJson(opts);
    expect(r.data).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ reasoning: { enabled: false }, max_tokens: 2500, response_format: { type: "json_schema" } });
  });

  it("steps down through the settings a model or provider rejects, ending with plain JSON and no thinking switch", async () => {
    replies = [reply({}, 400), reply({}, 400), reply({}, 400), good()];
    await chatJson(opts);
    expect(sent.map((s) => [s.response_format.type, s.reasoning ? "off" : "default"])).toEqual([
      ["json_schema", "off"],
      ["json_object", "off"],
      ["json_schema", "default"],
      ["json_object", "default"],
    ]);
  });

  it("when a model thinks anyway and runs out of room, retries once with a bigger limit and adds up the cost", async () => {
    replies = [outOfRoom(0.002), good(0.005)];
    const r = await chatJson(opts);
    expect(r.data).toEqual({ ok: true });
    expect(sent.map((s) => s.max_tokens)).toEqual([2500, 10000]);
    expect(r.costUsd).toBeCloseTo(0.007, 6);
  });

  it("never grows the limit past the cap", async () => {
    replies = [outOfRoom(), good()];
    await chatJson({ ...opts, maxTokens: 9000 });
    expect(sent.map((s) => s.max_tokens)).toEqual([9000, 16000]);
  });

  it("gives up after that one retry and says what to change", async () => {
    replies = [outOfRoom(), outOfRoom()];
    await expect(chatJson(opts)).rejects.toThrow(/used its whole 10000-token limit thinking.*OPENROUTER_MODEL/);
    expect(sent).toHaveLength(2);
  });

  it("surfaces an error the provider tucked inside a 200 response", async () => {
    replies = [reply({ error: { message: "Provider returned error", code: 502 } })];
    await expect(chatJson(opts)).rejects.toThrow("OpenRouter: Provider returned error");
  });

  it("names a refusal or a filtered reply instead of a bare 'no content'", async () => {
    replies = [reply({ choices: [{ message: { content: null, refusal: "I cannot help with that" }, finish_reason: "stop" }] })];
    await expect(chatJson(opts)).rejects.toThrow(/refused: I cannot help with that/);
    replies = [reply({ choices: [{ message: { content: null }, finish_reason: "content_filter" }] })];
    await expect(chatJson(opts)).rejects.toThrow(/filtered the reply/);
    replies = [reply({ choices: [{ message: { content: "" }, finish_reason: "stop" }] })];
    await expect(chatJson(opts)).rejects.toThrow(/returned no content from .*finish reason: stop/);
  });

  it("still reads a reply wrapped in a code fence, and reports no cost when none is given", async () => {
    replies = [reply({ choices: [{ message: { content: '```json\n{"ok":true}\n```' }, finish_reason: "stop" }] })];
    const r = await chatJson(opts);
    expect(r).toMatchObject({ data: { ok: true }, costUsd: null });
  });

  it("reports other HTTP failures plainly", async () => {
    replies = [reply({ error: "bad key" }, 401)];
    await expect(chatJson(opts)).rejects.toThrow(/^OpenRouter 401/);
  });
});
