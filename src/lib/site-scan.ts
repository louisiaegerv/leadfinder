import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import * as cheerio from "cheerio";
import { OWNERISH } from "./enrich";
import type { ScanOutcome, SiteSignals } from "./site-types";

/**
 * A free first pass over a business's own website: plain HTTP fetch, no browser. Reads the
 * front page plus up to two more (About/Team, Contact) and pulls out social links, emails,
 * phones, a founder named in structured data, and signals about the site itself. Pages that
 * need JavaScript or block bots are reported as such, so a second pass can take them.
 */

// ---------- fetching, safely ----------

export type Fetched = { status: number; finalUrl: string; contentType: string; html: string; error?: string };
export type Fetcher = (url: string) => Promise<Fetched>;

const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 12_000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const PORTS = new Set(["", "80", "443", "8080", "8443"]);

/** True for addresses a public website should never resolve to (loopback, LAN, link-local, and so on). */
export function isPrivateIp(ip: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) ip = mapped[1];
  if (net.isIPv4(ip)) {
    const [a, b, c] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) || // 192.0.0.0/24 and TEST-NET-1; the rest of 192.0.x.x is public (WordPress.com lives there)
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    return l === "::" || l === "::1" || l.startsWith("fc") || l.startsWith("fd") || /^fe[89ab]/.test(l) || l.startsWith("ff");
  }
  return true; // not an address at all: don't trust it
}

// Tests use a local server, which the guard would rightly refuse. Never set this in real use.
const allowPrivate = () => process.env.SITE_SCAN_ALLOW_PRIVATE === "1";

/** Resolve the name ourselves and drop private answers, so a hostname can't smuggle in a local address. */
const guardedLookup = ((hostname: string, options: dns.LookupOptions, callback: (...args: unknown[]) => void) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = (addresses as dns.LookupAddress[]).filter((a) => allowPrivate() || !isPrivateIp(a.address));
    if (list.length === 0) return callback(Object.assign(new Error("private address refused"), { code: "EPRIVATE" }));
    if (options?.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}) as unknown as net.LookupFunction;

function once(url: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return reject(Object.assign(new Error("unsupported scheme"), { code: "EPROTO_SCHEME" }));
    if (!allowPrivate() && !PORTS.has(u.port)) return reject(Object.assign(new Error("port refused"), { code: "EPRIVATE" }));
    if (net.isIP(u.hostname.replace(/^\[|\]$/g, "")) && isPrivateIp(u.hostname.replace(/^\[|\]$/g, "")) && !allowPrivate())
      return reject(Object.assign(new Error("private address refused"), { code: "EPRIVATE" }));

    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      u,
      {
        method: "GET",
        lookup: guardedLookup,
        timeout: TIMEOUT_MS,
        agent: false,
        headers: {
          "user-agent": UA,
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "accept-language": "en-US,en;q=0.9",
          "accept-encoding": "gzip, deflate, br",
        },
      },
      (res) => {
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
        const decoder = enc === "gzip" ? zlib.createGunzip() : enc === "deflate" ? zlib.createInflate() : enc === "br" ? zlib.createBrotliDecompress() : null;
        const chunks: Buffer[] = [];
        let size = 0;
        const done = () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) });
        const source = decoder ? res.pipe(decoder) : res;
        source.on("data", (c: Buffer) => {
          size += c.length;
          if (size > MAX_BYTES) {
            chunks.push(c.subarray(0, c.length - (size - MAX_BYTES)));
            req.destroy();
            done();
          } else chunks.push(c);
        });
        source.on("end", done);
        source.on("error", () => done()); // a truncated or corrupt body still has whatever arrived
        res.on("error", () => done());
      },
    );
    const timer = setTimeout(() => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })), TIMEOUT_MS);
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    req.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    req.on("close", () => clearTimeout(timer));
    req.end();
  });
}

/** GET a page, following a few redirects, refusing private addresses at every hop, capping size and time. */
export const safeGet: Fetcher = async (start) => {
  let url = start;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const r = await once(url);
      const loc = r.headers.location;
      if (r.status >= 300 && r.status < 400 && loc) {
        url = new URL(loc, url).href;
        continue;
      }
      const contentType = String(r.headers["content-type"] ?? "");
      return { status: r.status, finalUrl: url, contentType, html: r.body.toString("utf8") };
    }
    return { status: 0, finalUrl: url, contentType: "", html: "", error: "ETOOMANYREDIRECTS" };
  } catch (e) {
    return { status: 0, finalUrl: url, contentType: "", html: "", error: (e as NodeJS.ErrnoException).code ?? (e as Error).name };
  }
};

// ---------- reading a page ----------

export const NETWORKS = ["facebook", "instagram", "linkedin", "youtube", "tiktok", "twitter", "yelp"] as const;
export type Network = (typeof NETWORKS)[number];

const squeeze = (s: string) => s.replace(/\s+/g, " ").trim();
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** The social network a link is a profile or page on, with a tidy url; null for share buttons, posts and everything else. */
export function socialOf(href: string): { network: Network; url: string } | null {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
  const parts = u.pathname.split("/").filter(Boolean);
  const first = (parts[0] ?? "").toLowerCase();
  const clean = (keep?: string) => {
    const base = `${u.protocol}//${u.hostname}${u.pathname.replace(/\/+$/, "")}`;
    return keep && u.searchParams.get(keep) ? `${base}?${keep}=${u.searchParams.get(keep)}` : base;
  };
  if (host === "facebook.com" || host === "fb.com") {
    if (!first || ["sharer", "sharer.php", "share", "share.php", "plugins", "dialog", "tr", "login", "login.php", "policies", "help", "events", "watch", "hashtag", "l.php"].includes(first)) return null;
    return { network: "facebook", url: first === "profile.php" ? clean("id") : clean() };
  }
  if (host === "instagram.com") {
    if (!first || ["p", "reel", "reels", "explore", "accounts", "stories", "tv", "direct"].includes(first)) return null;
    return { network: "instagram", url: clean() };
  }
  if (host === "linkedin.com") return ["company", "in", "school"].includes(first) && parts[1] ? { network: "linkedin", url: clean() } : null;
  if (host === "youtube.com") return first.startsWith("@") || ["channel", "c", "user"].includes(first) ? { network: "youtube", url: clean() } : null;
  if (host === "tiktok.com") return first.startsWith("@") ? { network: "tiktok", url: clean() } : null;
  if (host === "twitter.com" || host === "x.com") {
    if (!first || ["intent", "share", "home", "i", "search", "hashtag"].includes(first)) return null;
    return { network: "twitter", url: clean() };
  }
  if (host === "yelp.com") return first === "biz" && parts[1] ? { network: "yelp", url: clean() } : null;
  return null;
}

const JUNK_EMAIL_DOMAIN = /(^|\.)(example\.com|domain\.com|yourdomain\.com|email\.com|sentry\.io|wixpress\.com|sentry-next\.wixpress\.com|godaddy\.com)$/i;
const FILE_TLD = /\.(png|jpe?g|gif|svg|webp|css|js|ico|woff2?)$/i;

function cleanEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase().replace(/^mailto:/, "").split("?")[0];
  if (!/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(e) || FILE_TLD.test(e)) return null;
  if (JUNK_EMAIL_DOMAIN.test(e.split("@")[1]) || /^(no-?reply|donotreply)@/.test(e)) return null;
  return e;
}

/** Cloudflare hides emails behind a small XOR; undo it. */
function decodeCfEmail(hex: string): string | null {
  try {
    const key = parseInt(hex.slice(0, 2), 16);
    let out = "";
    for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
    return out;
  } catch {
    return null;
  }
}

const digits = (s: string) => s.replace(/\D/g, "");
function cleanPhone(raw: string): string | null {
  const t = squeeze(decodeURIComponentSafe(raw).replace(/^tel:/i, ""));
  return digits(t).length >= 10 && digits(t).length <= 15 ? t : null;
}
function decodeURIComponentSafe(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

const CHATS: [string, RegExp][] = [
  ["Tidio", /tidio\.(co|com)/i],
  ["Intercom", /intercom(cdn)?\.(io|com)|widget\.intercom/i],
  ["LiveChat", /livechatinc\.com|cdn\.livechat/i],
  ["Drift", /drift\.com|js\.driftt\.com/i],
  ["Crisp", /crisp\.chat/i],
  ["Tawk.to", /tawk\.to/i],
  ["Podium", /podium\.com|connect\.podium/i],
  ["Birdeye", /birdeye\.com/i],
  ["LeadConnector", /leadconnectorhq\.com\/(chat|loader)|msgsndr\.com/i],
  ["HubSpot chat", /js\.usemessages\.com|HubSpotConversations/i],
  ["Smartsupp", /smartsupp/i],
  ["Zendesk", /zopim|zdassets\.com|zendesk\.com\/embeddable/i],
  ["Olark", /olark\.com/i],
  ["Chatra", /chatra\.(io|com)/i],
  ["Messenger plugin", /fb-customerchat|customer_chat/i],
];
const BUILDERS: [string, RegExp][] = [
  ["wix", /wixstatic\.com|static\.parastorage\.com|wix\.com\/|X-Wix/i],
  ["squarespace", /squarespace\.com|static1\.squarespace/i],
  ["godaddy", /img\d?\.wsimg\.com|secureserver\.net|websitebuilder\.godaddy|godaddy\.com\/website/i],
  ["weebly", /weebly\.com|editmysite\.com/i],
  ["webflow", /webflow\.(com|io)|data-wf-(page|site)/i],
  ["shopify", /cdn\.shopify\.com/i],
  ["wordpress", /wp-content|wp-includes/i],
];
const FORM_EMBEDS = /jotform|hsforms|js\.hsforms|typeform\.com|wufoo|formstack|leadconnectorhq\.com\/widget\/form|gravityforms|wpforms|formspree|cognitoforms|123formbuilder/i;
const BOOKING = /calendly\.com|acuityscheduling\.com|squareup\.com\/appointments|setmore\.com|booksy\.com|housecallpro\.com|getjobber\.com|youcanbook\.me|vcita\.com|simplybook|appointlet/i;
// A bot-challenge page says so in its title or visible text. The word "captcha" alone proves nothing: normal pages carry reCAPTCHA on their contact forms.
const CHALLENGE_TITLE = /just a moment|attention required|access denied|are you a robot|verify you are (a )?human|security check|ddos protection|checking your browser|one more step/i;
const CHALLENGE_TEXT = /checking your browser before accessing|verify you are (a )?human|enable javascript and cookies to continue|complete the security check|your request has been blocked|you have been blocked/i;
const CHALLENGE_SOURCE = /_cf_chl_opt|cf-chl-bypass/; // Cloudflare's challenge script, absent from the real page behind it

const ABOUT_TEXT = /\b(about|our story|meet (the|our)|our team|team|who we are|the owner|owner|our company|company)\b/;
const ABOUT_PATH = /\/(about|about-us|aboutus|our-story|team|our-team|meet-the-team|meet-us|who-we-are|company|owner)(\/|$|\.)/i;
const CONTACT_TEXT = /\bcontact( us)?\b/;
const CONTACT_PATH = /\/(contact|contact-us|contactus|get-in-touch|free-quote|get-a-quote|request-a-quote)(\/|$|\.)/i;

export type LdInfo = { sameAs: string[]; phones: string[]; emails: string[]; people: { name: string; role: string }[] };

function readLd($: cheerio.CheerioAPI): LdInfo {
  const out: LdInfo = { sameAs: [], phones: [], emails: [], people: [] };
  const strings = (v: unknown): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(strings) : []);
  const personRoles = ["founder", "founders", "owner", "employee", "employees", "member", "members"] as const;

  const walk = (node: unknown, depth: number) => {
    if (depth > 6 || !node) return;
    if (Array.isArray(node)) return void node.forEach((n) => walk(n, depth + 1));
    if (typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    out.sameAs.push(...strings(o.sameAs));
    out.phones.push(...strings(o.telephone));
    out.emails.push(...strings(o.email));
    for (const key of personRoles) {
      for (const p of [o[key]].flat()) {
        if (!p || typeof p !== "object") continue;
        const po = p as Record<string, unknown>;
        const name = typeof po.name === "string" ? squeeze(po.name) : "";
        const title = typeof po.jobTitle === "string" ? po.jobTitle : "";
        const role = key.startsWith("founder") ? "founder" : key === "owner" ? "owner" : title;
        if (name && (role === "founder" || role === "owner" || OWNERISH.test(role))) out.people.push({ name, role });
      }
    }
    for (const v of Object.values(o)) if (v && typeof v === "object") walk(v, depth + 1);
  };

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text().replace(/^\s*<!--/, "").replace(/-->\s*$/, "").replace(/^\s*\/\/\s*<!\[CDATA\[|\/\/\s*\]\]>\s*$/g, "").trim();
    try {
      walk(JSON.parse(raw), 0);
    } catch {
      /* malformed structured data is common; skip it */
    }
  });
  return out;
}

export type PageInfo = {
  title: string | null;
  textLen: number;
  challenge: boolean;
  socials: Partial<Record<Network, string>>;
  emails: string[];
  phones: string[];
  aboutUrl: string | null;
  contactUrl: string | null;
  people: { name: string; role: string }[];
  signals: Omit<SiteSignals, "outcome" | "https" | "facebookUrl">;
};

/** Pull everything useful out of one page's HTML. `baseUrl` is where it was fetched from. */
export function parsePage(html: string, baseUrl: string): PageInfo {
  const raw = html;
  const $ = cheerio.load(html);
  const baseHost = hostOf(baseUrl);
  const ld = readLd($);

  const links = $("a[href]")
    .toArray()
    .flatMap((a) => {
      const el = $(a);
      let href: string;
      try {
        href = new URL(el.attr("href") ?? "", baseUrl).href;
      } catch {
        return [];
      }
      const text = squeeze(`${el.text()} ${el.attr("aria-label") ?? ""} ${el.attr("title") ?? ""}`).toLowerCase();
      return [{ href, text }];
    });

  // Emails: Cloudflare-hidden ones first, then mailto links, then the visible text.
  const emails = new Set<string>();
  $("[data-cfemail]").each((_, el) => {
    const d = decodeCfEmail($(el).attr("data-cfemail") ?? "");
    const e = d && cleanEmail(d);
    if (e) emails.add(e);
  });
  for (const l of links) if (l.href.startsWith("mailto:")) {
    const e = cleanEmail(decodeURIComponentSafe(l.href));
    if (e) emails.add(e);
  }
  for (const e of ld.emails) {
    const c = cleanEmail(e);
    if (c) emails.add(c);
  }

  const phones = new Map<string, string>();
  for (const l of links) if (l.href.startsWith("tel:")) {
    const p = cleanPhone(l.href);
    if (p) phones.set(digits(p), p);
  }
  for (const t of ld.phones) {
    const p = cleanPhone(t);
    if (p && !phones.has(digits(p))) phones.set(digits(p), p);
  }

  const socials: PageInfo["socials"] = {};
  for (const href of [...links.map((l) => l.href), ...ld.sameAs]) {
    const s = socialOf(href);
    if (s && !socials[s.network]) socials[s.network] = s.url;
  }

  const sameSite = (href: string) => hostOf(href) === baseHost;
  const home = new URL(baseUrl);
  const isHome = (href: string) => {
    const u = new URL(href);
    return u.pathname.replace(/\/+$/, "") === home.pathname.replace(/\/+$/, "") && !u.search;
  };
  const pick = (text: RegExp, path: RegExp) =>
    links.find((l) => sameSite(l.href) && !l.href.includes("#") && !isHome(l.href) && (text.test(l.text) || path.test(new URL(l.href).pathname)))?.href ?? null;

  // The text people see: scripts, styles and the like removed. The page source is still checked below for scripts and widgets.
  $("script, style, noscript, template, svg").remove();
  // Neighbouring elements must not run together ("Email" + "sales@x.com" would read as "Emailsales@x.com").
  $("*").append(" ");
  const body = $("body");
  const bodyText = squeeze(body.length ? body.text() : $.root().text());
  const visibleEmails = bodyText.match(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi) ?? [];
  for (const e of visibleEmails) {
    const c = cleanEmail(e);
    if (c) emails.add(c);
  }

  const years = [...bodyText.matchAll(/(?:©|&copy;|\(c\)|copyright)\s*(?:\(c\)\s*)?(\d{4})(?:\s*[-–]\s*(\d{4}))?/gi)]
    .flatMap((m) => [Number(m[1]), m[2] ? Number(m[2]) : 0])
    .filter((y) => y >= 1995 && y <= new Date().getFullYear() + 1);

  const forms = $("form")
    .toArray()
    .filter((f) => {
      const form = $(f);
      if (form.attr("role") === "search" || /search/i.test(form.attr("class") ?? "") || /search/i.test(form.attr("id") ?? "")) return false;
      const fields = form.find("input").toArray().filter((i) => !["hidden", "submit", "button", "search", "checkbox", "radio"].includes(($(i).attr("type") ?? "text").toLowerCase()));
      return form.find("textarea").length > 0 || fields.length >= 3;
    }).length;

  const chat = CHATS.find(([, re]) => re.test(raw))?.[0] ?? null;
  const builder = BUILDERS.find(([, re]) => re.test(raw))?.[0] ?? null;

  return {
    title: squeeze($("title").first().text()) || null,
    textLen: bodyText.length,
    challenge: (CHALLENGE_TITLE.test($("title").first().text()) || CHALLENGE_TEXT.test(bodyText) || CHALLENGE_SOURCE.test(raw)) && bodyText.length < 2500,
    socials,
    emails: [...emails].slice(0, 6),
    phones: [...phones.values()].slice(0, 4),
    aboutUrl: pick(ABOUT_TEXT, ABOUT_PATH),
    contactUrl: pick(CONTACT_TEXT, CONTACT_PATH),
    people: ld.people,
    signals: {
      viewport: /<meta[^>]+name=["']viewport["']/i.test(raw),
      hasForm: forms > 0 || FORM_EMBEDS.test(raw),
      hasBooking: BOOKING.test(raw),
      chat,
      fbPixel: /fbq\(|connect\.facebook\.net\/[^"']*fbevents|facebook\.com\/tr\?/i.test(raw),
      analytics: /googletagmanager\.com|gtag\(|google-analytics\.com/i.test(raw),
      builder,
      copyrightYear: years.length ? Math.max(...years) : null,
    },
  };
}

// ---------- scanning a site ----------

export type SiteScan = {
  url: string;
  finalUrl: string | null;
  outcome: ScanOutcome;
  status: number | null;
  error: string | null;
  scannedAt: string;
  title: string | null;
  textLen: number;
  socials: Partial<Record<Network, string>>;
  emails: string[];
  phones: string[];
  aboutUrl: string | null;
  contactUrl: string | null;
  /** Founders and owners named in the site's structured data. */
  people: { name: string; role: string }[];
  signals: SiteSignals;
  pages: { url: string; status: number }[];
};

const BLANK_BELOW = 400;

/** Why a fetch did or didn't give a readable page. The page-content checks (blank, challenge) happen after parsing. */
export function classifyFetch(f: Fetched): ScanOutcome | null {
  if (f.error) return f.error === "ENOTFOUND" ? "dead" : f.error === "EPRIVATE" || f.error === "EPROTO_SCHEME" ? "refused" : "error";
  if (f.status === 404 || f.status === 410) return "dead";
  if (f.status === 403 || f.status === 429 || f.status === 503) return "blocked";
  if (f.status >= 400 || f.status === 0) return "error";
  if (f.contentType && !/html|xml/i.test(f.contentType)) return "not_html";
  return null;
}

const NO_SIGNALS = (outcome: ScanOutcome, https: boolean): SiteSignals => ({
  outcome,
  https,
  viewport: false,
  hasForm: false,
  hasBooking: false,
  chat: null,
  fbPixel: false,
  analytics: false,
  builder: null,
  copyrightYear: null,
  facebookUrl: null,
});

export async function scanSite(url: string, fetcher: Fetcher = safeGet): Promise<SiteScan> {
  const base: SiteScan = {
    url,
    finalUrl: null,
    outcome: "error",
    status: null,
    error: null,
    scannedAt: new Date().toISOString(),
    title: null,
    textLen: 0,
    socials: {},
    emails: [],
    phones: [],
    aboutUrl: null,
    contactUrl: null,
    people: [],
    signals: NO_SIGNALS("error", url.startsWith("https")),
    pages: [],
  };

  const home = await fetcher(url);
  base.finalUrl = home.finalUrl;
  base.status = home.status || null;
  base.error = home.error ?? null;
  base.pages.push({ url: home.finalUrl, status: home.status });
  const https = home.finalUrl.startsWith("https:");

  const failed = classifyFetch(home);
  if (failed) return { ...base, outcome: failed, signals: NO_SIGNALS(failed, https) };

  const page = parsePage(home.html, home.finalUrl);
  const outcome: ScanOutcome = page.challenge ? "blocked" : page.textLen < BLANK_BELOW ? "blank" : "ok";
  const merged = {
    socials: { ...page.socials },
    emails: new Set(page.emails),
    phones: new Map(page.phones.map((p) => [digits(p), p] as const)),
    people: [...page.people],
    // A form, booking widget or chat counts if it is on any page we read, not just the front page.
    hasForm: page.signals.hasForm,
    hasBooking: page.signals.hasBooking,
    chat: page.signals.chat,
  };

  // Only a readable front page is worth following into About and Contact.
  if (outcome === "ok") {
    for (const next of [...new Set([page.aboutUrl, page.contactUrl].filter((u): u is string => !!u))].slice(0, 2)) {
      const f = await fetcher(next);
      base.pages.push({ url: f.finalUrl, status: f.status });
      if (classifyFetch(f) || !f.html) continue;
      const p = parsePage(f.html, f.finalUrl);
      for (const [k, v] of Object.entries(p.socials)) merged.socials[k as Network] ??= v;
      p.emails.forEach((e) => merged.emails.add(e));
      p.phones.forEach((ph) => merged.phones.has(digits(ph)) || merged.phones.set(digits(ph), ph));
      for (const person of p.people) if (!merged.people.some((x) => x.name === person.name)) merged.people.push(person);
      merged.hasForm ||= p.signals.hasForm;
      merged.hasBooking ||= p.signals.hasBooking;
      merged.chat ??= p.signals.chat;
    }
  }

  return {
    ...base,
    outcome,
    title: page.title,
    textLen: page.textLen,
    socials: merged.socials,
    emails: [...merged.emails].slice(0, 6),
    phones: [...merged.phones.values()].slice(0, 4),
    aboutUrl: page.aboutUrl,
    contactUrl: page.contactUrl,
    people: merged.people,
    signals: { outcome, https, ...page.signals, hasForm: merged.hasForm, hasBooking: merged.hasBooking, chat: merged.chat, facebookUrl: merged.socials.facebook ?? null },
  };
}
