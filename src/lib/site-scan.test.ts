import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import zlib from "node:zlib";
import type { AddressInfo } from "node:net";
import { classifyFetch, isPrivateIp, parsePage, safeGet, scanSite, socialOf, type Fetched, type Fetcher } from "./site-scan";

const page = (body: string, head = "") => `<!doctype html><html><head><title>Acme Epoxy</title><meta name="viewport" content="width=device-width">${head}</head><body>${body}</body></html>`;
const PAD = "We install epoxy and polished concrete floors for garages, shops and showrooms across Houston. ".repeat(8);

describe("socialOf", () => {
  it("accepts profile and page links and tidies them", () => {
    expect(socialOf("https://www.facebook.com/AcmeEpoxy/?ref=page_internal")).toEqual({ network: "facebook", url: "https://www.facebook.com/AcmeEpoxy" });
    expect(socialOf("https://m.facebook.com/profile.php?id=100012345&ref=x")).toEqual({ network: "facebook", url: "https://m.facebook.com/profile.php?id=100012345" });
    expect(socialOf("https://instagram.com/acme.epoxy/")?.network).toBe("instagram");
    expect(socialOf("https://www.linkedin.com/company/acme-epoxy/")?.network).toBe("linkedin");
    expect(socialOf("https://www.youtube.com/@AcmeEpoxy")?.network).toBe("youtube");
    expect(socialOf("https://x.com/acme")?.network).toBe("twitter");
    expect(socialOf("https://www.yelp.com/biz/acme-epoxy-houston")?.network).toBe("yelp");
  });

  it("rejects share buttons, posts, plugins and unrelated links", () => {
    for (const u of [
      "https://www.facebook.com/sharer/sharer.php?u=https://acme.com",
      "https://www.facebook.com/plugins/like.php?href=x",
      "https://www.facebook.com/",
      "https://www.instagram.com/p/Cabc123/",
      "https://twitter.com/intent/tweet?text=hi",
      "https://www.linkedin.com/shareArticle?url=x",
      "https://www.youtube.com/watch?v=abc",
      "https://example.com/facebook.com/acme",
      "not a url",
    ])
      expect(socialOf(u), u).toBeNull();
  });
});

describe("isPrivateIp", () => {
  it("flags loopback, LAN, link-local, carrier-grade NAT, IPv6 local and IPv4-mapped addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.169", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "224.0.0.1"])
      expect(isPrivateIp(ip), ip).toBe(true);
  });

  it("lets public addresses through", () => {
    for (const ip of ["8.8.8.8", "93.184.216.34", "172.32.0.1", "100.63.0.1", "2606:4700:4700::1111"]) expect(isPrivateIp(ip), ip).toBe(false);
    // WordPress.com's public addresses sit in 192.0.x.x; only 192.0.0.x and 192.0.2.x are reserved
    for (const ip of ["192.0.78.208", "192.0.78.174", "192.0.1.1"]) expect(isPrivateIp(ip), ip).toBe(false);
    for (const ip of ["192.0.0.1", "192.0.2.50", "198.51.100.7", "203.0.113.9"]) expect(isPrivateIp(ip), ip).toBe(true);
    expect(isPrivateIp("not-an-ip")).toBe(true);
  });
});

describe("parsePage", () => {
  const html = page(
    `<header><a href="/about-us">Our Story</a> <a href="/contact">Contact</a> <a href="/services">Services</a>
       <a href="tel:+17135550100">(713) 555-0100</a>
       <a href="https://www.facebook.com/AcmeEpoxy"><i aria-label="Facebook"></i></a>
       <a href="https://www.facebook.com/sharer/sharer.php?u=x">Share</a>
       <a href="https://www.instagram.com/acme.epoxy/">IG</a></header>
     <main><p>${PAD}</p><p>Email us: <a href="mailto:Info@Acme-Epoxy.com?subject=Quote">info</a> or sales@acme-epoxy.com, logo@2x.png, test@example.com, noreply@acme-epoxy.com</p>
       <span class="__cf_email__" data-cfemail="${"00" + [..."owner@acme-epoxy.com"].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("")}">[email protected]</span>
       <form action="/quote"><input name="name"><input name="phone"><input name="email"><textarea name="msg"></textarea></form>
       <form role="search"><input type="search" name="q"></form></main>
     <footer>© 2019 Acme Epoxy LLC. All rights reserved.</footer>
     <script>fbq('init','123'); </script><script src="https://embed.tawk.to/abc/default"></script>`,
    `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"LocalBusiness","name":"Acme Epoxy","telephone":"(713) 555-0199","sameAs":["https://www.linkedin.com/company/acme-epoxy","https://www.youtube.com/@AcmeEpoxy"],"founder":{"@type":"Person","name":"Juan Gonzalez"}}]}</script>
     <script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script><link href="/wp-content/themes/x/style.css">`,
  );
  const p = parsePage(html, "https://acme-epoxy.com/");

  it("finds socials from links and from structured data, ignoring share buttons", () => {
    expect(p.socials).toEqual({
      facebook: "https://www.facebook.com/AcmeEpoxy",
      instagram: "https://www.instagram.com/acme.epoxy",
      linkedin: "https://www.linkedin.com/company/acme-epoxy",
      youtube: "https://www.youtube.com/@AcmeEpoxy",
    });
  });

  it("collects emails (mailto, visible, Cloudflare-hidden), dropping junk, and phones from tel links and structured data", () => {
    expect(p.emails.sort()).toEqual(["info@acme-epoxy.com", "owner@acme-epoxy.com", "sales@acme-epoxy.com"]);
    expect(p.phones).toEqual(["+17135550100", "(713) 555-0199"]);
  });

  it("keeps neighbouring elements apart, so an email is not glued to the label or phone number beside it", () => {
    const glued = parsePage(page(`<p>${PAD}</p><div><span>Email</span><span>sales@acme-epoxy.com</span></div><div><span>253-3211</span><span>info@acme-epoxy.com</span></div>`), "https://acme-epoxy.com/");
    expect(glued.emails.sort()).toEqual(["info@acme-epoxy.com", "sales@acme-epoxy.com"]);
  });

  it("finds the About and Contact pages on the same site only", () => {
    expect(p.aboutUrl).toBe("https://acme-epoxy.com/about-us");
    expect(p.contactUrl).toBe("https://acme-epoxy.com/contact");
    expect(parsePage(page(`<p>${PAD}</p><a href="https://other.com/about">About</a>`), "https://acme-epoxy.com/").aboutUrl).toBeNull();
  });

  it("reads a founder named in structured data", () => {
    expect(p.people).toEqual([{ name: "Juan Gonzalez", role: "founder" }]);
  });

  it("detects the site signals: form (and not the search box), chat, pixel, analytics, builder, copyright, viewport", () => {
    expect(p.signals).toEqual({ viewport: true, hasForm: true, hasBooking: false, chat: "Tawk.to", fbPixel: true, analytics: true, builder: "wordpress", copyrightYear: 2019 });
    expect(p.textLen).toBeGreaterThan(400);
  });

  it("does not mistake a normal page with reCAPTCHA, or a site-builder config that mentions captcha, for a bot challenge", () => {
    const withRecaptcha = parsePage(page(`<p>${PAD}</p><form><input name=a><input name=b><input name=c><div class="g-recaptcha" data-sitekey="x"></div><!-- Google reCAPTCHA box --></form>`, `<script>var cfg={"modules":["appMonitoring","captcha","codeEmbed"]}</script>`), "https://a.com/");
    expect(withRecaptcha.challenge).toBe(false);
    const cloudflare = parsePage("<html><head><title>Just a moment...</title></head><body><h1>Checking your browser before accessing example.com</h1></body></html>", "https://a.com/");
    expect(cloudflare.challenge).toBe(true);
    expect(parsePage("<html><head><title>x</title><script>window._cf_chl_opt={cvId:'3'}</script></head><body>hi</body></html>", "https://a.com/").challenge).toBe(true);
    // a long, real page that happens to say "access denied" somewhere is still a real page
    expect(parsePage(page(`<p>${PAD.repeat(6)}</p><p>Access denied to unauthorised vehicles.</p>`), "https://a.com/").challenge).toBe(false);
  });

  it("does not mistake a search box or newsletter field for a quote form", () => {
    const s = parsePage(page(`<p>${PAD}</p><form role="search"><input type="search"></form><form><input type="email" name="e"></form>`), "https://a.com/");
    expect(s.signals.hasForm).toBe(false);
    expect(parsePage(page(`<p>${PAD}</p><iframe src="https://link.jotform.com/abc"></iframe>`), "https://a.com/").signals.hasForm).toBe(true);
  });

  it("reads a JavaScript-built shell as nearly empty text, with no viewport tag, without throwing", () => {
    const shell = parsePage("<html><head><title>Loading</title></head><body><div id='root'></div><script>window.app()</script></body></html>", "https://a.com/");
    expect(shell.textLen).toBeLessThan(50);
    expect(shell.signals.viewport).toBe(false);
    expect(parsePage("", "https://a.com/")).toMatchObject({ textLen: 0, emails: [], phones: [], aboutUrl: null });
    expect(parsePage("<<<not html>>>", "https://a.com/").socials).toEqual({});
  });

  it("survives broken structured data", () => {
    expect(() => parsePage(page(`<p>${PAD}</p>`, `<script type="application/ld+json">{ not json </script>`), "https://a.com/")).not.toThrow();
  });
});

describe("classifyFetch", () => {
  const f = (over: Partial<Fetched>): Fetched => ({ status: 200, finalUrl: "https://a.com/", contentType: "text/html", html: "x", ...over });
  it("names why a page could not be read", () => {
    expect(classifyFetch(f({}))).toBeNull();
    expect(classifyFetch(f({ status: 0, error: "ENOTFOUND" }))).toBe("dead");
    expect(classifyFetch(f({ status: 404 }))).toBe("dead");
    expect(classifyFetch(f({ status: 410 }))).toBe("dead");
    expect(classifyFetch(f({ status: 403 }))).toBe("blocked");
    expect(classifyFetch(f({ status: 429 }))).toBe("blocked");
    expect(classifyFetch(f({ status: 500 }))).toBe("error");
    expect(classifyFetch(f({ status: 0, error: "ECONNRESET" }))).toBe("error");
    expect(classifyFetch(f({ status: 0, error: "EPRIVATE" }))).toBe("refused");
    expect(classifyFetch(f({ contentType: "application/pdf" }))).toBe("not_html");
  });
});

describe("scanSite", () => {
  const BASE = "https://acme-epoxy.com/";
  const home = page(`<a href="/about">About us</a><a href="/contact">Contact</a><a href="https://facebook.com/acme">f</a><p>${PAD}</p><footer>© ${new Date().getFullYear()}</footer>`);
  const about = page(`<p>${PAD}</p><a href="https://instagram.com/acme">ig</a><a href="mailto:owner@acme-epoxy.com">mail</a>`);
  const contact = page(`<p>${PAD}</p><a href="tel:7135550100">call</a><form><input name=a><input name=b><input name=c></form>`);
  const ok = (html: string, url: string): Fetched => ({ status: 200, finalUrl: url, contentType: "text/html; charset=utf-8", html });

  it("reads the front page, follows About and Contact, and merges what they hold", async () => {
    const seen: string[] = [];
    const fetcher: Fetcher = async (u) => {
      seen.push(u);
      return u === BASE ? ok(home, u) : u.endsWith("/about") ? ok(about, u) : ok(contact, u);
    };
    const s = await scanSite(BASE, fetcher);
    expect(seen).toEqual([BASE, "https://acme-epoxy.com/about", "https://acme-epoxy.com/contact"]);
    expect(s.outcome).toBe("ok");
    expect(s.socials).toEqual({ facebook: "https://facebook.com/acme", instagram: "https://instagram.com/acme" });
    expect(s.emails).toEqual(["owner@acme-epoxy.com"]);
    expect(s.phones).toEqual(["7135550100"]);
    expect(s.signals).toMatchObject({ outcome: "ok", https: true, viewport: true, facebookUrl: "https://facebook.com/acme" });
    // the quote form lives on the Contact page, not the front page, and still counts
    expect(s.signals.hasForm).toBe(true);
  });

  it("does not follow links from a page it could not read, and says what went wrong", async () => {
    let calls = 0;
    const blank = await scanSite(BASE, async (u) => (calls++, ok("<html><body><div id=root></div><a href='/about'>About</a></body></html>", u)));
    expect(blank).toMatchObject({ outcome: "blank", signals: { outcome: "blank" } });
    expect(calls).toBe(1);

    expect(await scanSite(BASE, async (u) => ({ status: 403, finalUrl: u, contentType: "text/html", html: "Forbidden" }))).toMatchObject({ outcome: "blocked", status: 403 });
    expect(await scanSite(BASE, async (u) => ({ status: 0, finalUrl: u, contentType: "", html: "", error: "ENOTFOUND" }))).toMatchObject({ outcome: "dead", error: "ENOTFOUND" });
    expect(await scanSite(BASE, async (u) => ok("<html><head><title>Just a moment...</title></head><body>Checking your browser before accessing</body></html>", u))).toMatchObject({ outcome: "blocked" });
  });

  it("a failing About page does not spoil what the front page gave", async () => {
    const s = await scanSite(BASE, async (u) => (u === BASE ? ok(home, u) : { status: 500, finalUrl: u, contentType: "text/html", html: "oops" }));
    expect(s.outcome).toBe("ok");
    expect(s.socials.facebook).toBe("https://facebook.com/acme");
  });
});

// ---------- the real fetcher, against a local server ----------

describe("safeGet", () => {
  let server: http.Server;
  let base = "";
  const prior = process.env.SITE_SCAN_ALLOW_PRIVATE;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/gzip") {
        res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
        return void res.end(zlib.gzipSync("<html><body>zipped hello</body></html>"));
      }
      if (req.url === "/br") {
        res.writeHead(200, { "content-type": "text/html", "content-encoding": "br" });
        return void res.end(zlib.brotliCompressSync("<html><body>brotli hello</body></html>"));
      }
      if (req.url === "/redir") return void res.writeHead(302, { location: "/gzip" }).end();
      if (req.url === "/loop") return void res.writeHead(302, { location: "/loop" }).end();
      if (req.url === "/big") {
        res.writeHead(200, { "content-type": "text/html" });
        return void res.end("x".repeat(3_000_000));
      }
      if (req.url === "/pdf") return void res.writeHead(200, { "content-type": "application/pdf" }).end("%PDF");
      res.writeHead(200, { "content-type": "text/html" }).end("<html><body>plain hello</body></html>");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server.close();
    if (prior === undefined) delete process.env.SITE_SCAN_ALLOW_PRIVATE;
    else process.env.SITE_SCAN_ALLOW_PRIVATE = prior;
  });

  it("refuses loopback and LAN addresses, by number and by name, unless the test switch is on", async () => {
    delete process.env.SITE_SCAN_ALLOW_PRIVATE;
    for (const u of [`${base}/`, "http://localhost/", "http://[::1]/", "http://192.168.1.1/", "http://169.254.169.254/latest/meta-data/", "http://10.0.0.5/"])
      expect(await safeGet(u), u).toMatchObject({ status: 0, error: "EPRIVATE", html: "" });
    expect(await safeGet("file:///etc/passwd")).toMatchObject({ error: "EPROTO_SCHEME" });
  });

  describe("when local addresses are allowed (tests only)", () => {
    beforeAll(() => void (process.env.SITE_SCAN_ALLOW_PRIVATE = "1"));

    it("decodes gzip and brotli, and follows a redirect", async () => {
      expect((await safeGet(`${base}/gzip`)).html).toContain("zipped hello");
      expect((await safeGet(`${base}/br`)).html).toContain("brotli hello");
      const r = await safeGet(`${base}/redir`);
      expect(r.html).toContain("zipped hello");
      expect(r.finalUrl).toBe(`${base}/gzip`);
    });

    it("gives up on a redirect loop, and caps a huge page instead of reading it all", async () => {
      expect((await safeGet(`${base}/loop`)).error).toBe("ETOOMANYREDIRECTS");
      const big = await safeGet(`${base}/big`);
      expect(big.html.length).toBeLessThanOrEqual(1_500_000);
      expect(big.html.length).toBeGreaterThan(1_000_000);
    });

    it("reports the content type so a non-page is recognised, and an unreachable port as an error", async () => {
      expect(classifyFetch(await safeGet(`${base}/pdf`))).toBe("not_html");
      expect((await safeGet("http://127.0.0.1:1/")).error).toBe("ECONNREFUSED");
    });
  });
});
