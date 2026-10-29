import { OFFER_LABEL, type OfferKey } from "./offers";

export type BriefInput = {
  offer: OfferKey;
  runnerUp: OfferKey | null;
  title: string;
  reviews: number | null;
  rating: number | null;
  evidence: string[];
};

export type Brief = {
  offer: OfferKey;
  hook: string;
  question: string;
  facts: string[];
  objections: { they: string; reply: string }[];
  ask: string;
  fallback: { offer: OfferKey; hook: string } | null;
};

type Angle = {
  hook: (b: BriefInput) => string;
  question: string;
  objections: { they: string; reply: string }[];
};

const proof = (b: BriefInput) =>
  b.reviews != null && b.reviews > 0 && b.rating != null ? `${b.reviews} Google reviews at ${b.rating} stars` : "a solid reputation locally";

// Scripts are starting points to say in your own words. They make no promises about results.
const ANGLES: Record<OfferKey, Angle> = {
  facebook_ads: {
    hook: (b) => `${b.title} has ${proof(b)}, so people clearly trust you. I help local contractors turn that trust into booked estimates with Facebook ads.`,
    question: "Are you running any paid ads right now, or is the work mostly referrals and Google?",
    objections: [
      { they: "We get enough work from referrals.", reply: "Referrals are the best kind. Ads sit on top of them and fill the slow months. Would a few extra estimates a week be useful, or are you booked out?" },
      { they: "Ads didn't work when I tried them.", reply: "What did you try, and who ran it? It usually comes down to what happens after the click, mainly how fast someone follows up with the lead." },
      { they: "Sounds expensive.", reply: "Fair. We'd start with a small test budget so you see what a lead actually costs before putting more behind it." },
    ],
  },
  speed_to_lead: {
    hook: (b) => `When someone calls or fills out a form for ${b.title} and you're on a job, how long until they hear back? Most customers hire whoever responds first.`,
    question: "What happens to a call when you're on a job site and can't pick up?",
    objections: [
      { they: "I answer my phone.", reply: "Great when you can. This only covers the calls you miss: evenings, weekends, and when you're mid-job. Is a missed call ever a lost job?" },
      { they: "People don't like talking to a bot.", reply: "It texts from your number, keeps it short, and hands over to you the moment they reply. The alternative is no answer at all." },
      { they: "I already have a receptionist.", reply: "Does she cover after hours and weekends? We'd back her up there, not replace her." },
    ],
  },
  db_reactivation: {
    hook: (b) => `${b.title} has ${proof(b)}. Most customers never hear from a contractor again after the job. A short text to your past customers can bring some back for repeat work and referrals.`,
    question: "Do you have a list of past customers, even if it's just invoices, old quotes, or your phone contacts?",
    objections: [
      { they: "I don't have a list.", reply: "Check your invoices, QuickBooks or phone. Even 100 names is enough to test, and we'll help you pull it together." },
      { they: "I don't want to bug old customers.", reply: "It's one friendly message with an easy opt-out. Most owners are surprised how many people write back glad to hear from them." },
      { they: "Those are old leads, they've moved on.", reply: "Some have. Past customers and people who got a quote and never replied are warmer than cold strangers, and it costs far less to reach them." },
    ],
  },
  review_system: {
    hook: (b) => `${b.title} is at ${proof(b)}. Reviews decide who gets the call in the map results, and most happy customers never leave one unless they're asked right after the job.`,
    question: "How do you ask customers for a review today? Do you ever follow up if they don't?",
    objections: [
      { they: "Customers review us on their own.", reply: "Some do, but happy customers rarely bother and unhappy ones usually do. Asking every customer right after the job evens that out." },
      { they: "Reviews don't matter much for us.", reply: "People compare two or three companies on their phone before they call. The one with more recent reviews tends to get the call." },
      { they: "I'm worried about bad reviews.", reply: "The system sends unhappy customers to you privately first, so you get the chance to fix it before it goes public." },
    ],
  },
  website: {
    hook: (b) => `I looked at how ${b.title} shows up online, and the website looks like the biggest gap. People check a site on their phone before they pick up the phone.`,
    question: "Where do most of your new customers find you right now, and do they ever ask for photos or past work?",
    objections: [
      { they: "My Facebook page is enough.", reply: "It helps, but it's hard to get found from search and it doesn't show your best work or take estimate requests. A simple site does that." },
      { they: "I had a website and got nothing from it.", reply: "A site sitting on its own doesn't do much. Ours is built around getting calls and estimate requests, and it ties into the rest of your marketing." },
      { they: "Customers don't care about websites.", reply: "Many don't say so, but they look. It's how a stranger decides you're a real business worth calling." },
    ],
  },
};

const COMMON: { they: string; reply: string }[] = [
  { they: "Just send me some info.", reply: "Happy to. What's the best email? I'll also include a two-minute example so it's concrete. Can I check back Thursday to see what you think?" },
  { they: "I'm busy right now.", reply: "Understood, I'll be quick. I'd just like fifteen minutes on a call to show you what I found. What day is better?" },
  { they: "How much does it cost?", reply: "It depends on what you need, and most owners start small. That's what the fifteen minutes is for. Fair enough?" },
];

const ASK = "Ask for a 15-minute call or video chat where you show them what you found. Pick a time on the call instead of saying you'll follow up.";

/** "Pending:" lines say what we couldn't check yet, which is no use on a call. */
const isBusinessFact = (line: string) => !line.startsWith("Pending:");

export function buildBrief(b: BriefInput): Brief {
  const angle = ANGLES[b.offer];
  const fallback = b.runnerUp && b.runnerUp !== b.offer ? { offer: b.runnerUp, hook: ANGLES[b.runnerUp].hook(b) } : null;
  return {
    offer: b.offer,
    hook: angle.hook(b),
    question: angle.question,
    facts: b.evidence.filter(isBusinessFact),
    objections: [...angle.objections, ...COMMON],
    ask: ASK,
    fallback,
  };
}

/** Plain-text version for the copy button. */
export function briefToText(brief: Brief, title: string): string {
  const out = [
    `${title}: lead with ${OFFER_LABEL[brief.offer]}`,
    "",
    `Opener: ${brief.hook}`,
    `Ask: ${brief.question}`,
  ];
  if (brief.facts.length) out.push("", "What we noticed:", ...brief.facts.map((f) => `- ${f}`));
  out.push("", "If they say:", ...brief.objections.map((o) => `- "${o.they}" ${o.reply}`));
  out.push("", `Close: ${brief.ask}`);
  if (brief.fallback) out.push("", `If it doesn't land, pivot to ${OFFER_LABEL[brief.fallback.offer]}: ${brief.fallback.hook}`);
  return out.join("\n");
}
