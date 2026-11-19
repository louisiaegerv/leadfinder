import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playbookSchema } from "./playbook";

const model = {
  description: "Independent law firms serving local clients.",
  target: "Independent law practices, not legal directories.",
  seedQueries: ["law firm", "Law Firm", "personal injury lawyer"],
  includeCategories: ["Law firm", "Attorney"],
  broadCategories: [],
  excludeCategories: ["Legal services directory"],
  includeKeywords: ["Attorney", "law", "attorney"],
  chainExclusions: ["LegalZoom"],
  ticketSize: "high",
  salesCycle: "months",
  seasonality: "flat",
  channelFit: "search",
  offerWeights: { facebook_ads: 0.4, speed_to_lead: 1.9, db_reactivation: 3, review_system: 1.26, website: -1 },
};

describe("suggestNiche", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(model) }, finish_reason: "stop" }], usage: { cost: 0.001 } }))));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns form values that the playbook schema accepts, with lists de-duplicated and weights held to 0..2", async () => {
    const { suggestNiche } = await import("./niche-suggest");
    const r = await suggestNiche({ name: "law firms", description: "" });
    const pb = r.suggestion.playbook;
    expect(pb.seedQueries).toEqual(["law firm", "personal injury lawyer"]);
    expect(pb.includeKeywords).toEqual(["attorney", "law"]);
    expect(pb.offerWeights).toEqual({ facebook_ads: 0.4, speed_to_lead: 1.9, db_reactivation: 2, review_system: 1.3, website: 0 });
    expect(pb.trade).toEqual({ ticketSize: "high", salesCycle: "months", seasonality: "flat", channelFit: "search" });
    expect(playbookSchema.safeParse(pb).success).toBe(true);
    expect(r.costUsd).toBe(0.001);
  });

  it("sends the name and description to the model as quoted data", async () => {
    const { suggestNiche } = await import("./niche-suggest");
    await suggestNiche({ name: "law firms", description: "small firms" });
    const body = JSON.parse(String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body));
    expect(body.messages[1].content).toContain('"law firms"');
    expect(body.messages[1].content).toContain('"small firms"');
  });

  it("rejects a missing name", async () => {
    const { suggestInput } = await import("./niche-suggest");
    expect(suggestInput.safeParse({ name: " " }).success).toBe(false);
  });
});
