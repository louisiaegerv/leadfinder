import { z } from "zod";
import { OFFERS } from "./offers";

/**
 * Playbook = the settings stored on a niche. Presets are static templates;
 * creating a niche deep-copies one, so later edits never leak across niches.
 */
export const playbookSchema = z.object({
  seedQueries: z.array(z.string()).default([]),
  includeCategories: z.array(z.string()).default([]),
  excludeCategories: z.array(z.string()).default([]),
  /** Keywords that mark a title/domain as on-target even if categories are vague. */
  includeKeywords: z.array(z.string()).default([]),
  /** Chain / franchise names to drop for this niche only. */
  chainExclusions: z.array(z.string()).default([]),
  /** Trade facts that feed offer-fit (not a scoring editor). */
  trade: z
    .object({
      ticketSize: z.enum(["low", "medium", "high"]).default("medium"),
      salesCycle: z.enum(["days", "weeks", "months"]).default("weeks"),
      seasonality: z.enum(["flat", "seasonal"]).default("flat"),
      channelFit: z.enum(["meta", "search", "both"]).default("both"),
    })
    .default({ ticketSize: "medium", salesCycle: "weeks", seasonality: "flat", channelFit: "both" }),
  /** A few adjustable weights, one per offer, 0..2 (1 = neutral). */
  offerWeights: z
    .partialRecord(z.enum(OFFERS), z.number().min(0).max(2))
    .default({
      facebook_ads: 1,
      speed_to_lead: 1,
      db_reactivation: 1,
      review_system: 1,
      website: 1,
    }),
  /** Short call/pitch script per offer, plain text. */
  scripts: z.partialRecord(z.enum(OFFERS), z.string()).default({}),
});

export type Playbook = z.infer<typeof playbookSchema>;

export function emptyPlaybook(): Playbook {
  return playbookSchema.parse({});
}
