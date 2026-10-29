/** The four lead offers plus the catch-all. Fixed model, not a scoring editor. */
export const OFFERS = [
  "facebook_ads",
  "speed_to_lead",
  "db_reactivation",
  "review_system",
  "website",
] as const;

export type OfferKey = (typeof OFFERS)[number];

export const OFFER_LABEL: Record<OfferKey, string> = {
  facebook_ads: "Facebook ads",
  speed_to_lead: "Speed to lead",
  db_reactivation: "Database reactivation",
  review_system: "Review system",
  website: "Website / other",
};

export const FACEBOOK_STATES = [
  "no_page",
  "page_no_ads",
  "active_ads",
  "active_ads_weak_landing",
] as const;
export type FacebookState = (typeof FACEBOOK_STATES)[number];

export const STAGES = [
  "new",
  "dialed",
  "conversation",
  "booked",
  "held",
  "proposal",
  "won",
  "lost",
] as const;
export type Stage = (typeof STAGES)[number];
