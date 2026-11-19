import { beforeAll, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lf-rescan-")), "t.db");
process.env.DATABASE_PATH = tmp;

let route: typeof import("./route");
let nicheId = 0;
const ctx = () => ({ params: Promise.resolve({ id: String(nicheId) }) });

beforeAll(async () => {
  const { db, schema: s } = await import("@/db");
  const { emptyPlaybook } = await import("@/lib/playbook");
  route = await import("./route");
  nicheId = db.insert(s.niches).values({ name: "N", target: "", playbook: emptyPlaybook() }).returning().get().id;
  db.insert(s.places).values({ placeId: "P", title: "P", categories: [], website: "https://p.test/", domain: "p.test", scrapedAt: new Date() }).run();
  db.insert(s.nichePlaces).values({ nicheId, placeId: "P", relevance: "target" }).run();
});

describe("rescan route", () => {
  const get = async () => (await route.GET(new Request("http://x"), ctx())).json();

  it("counts a website that has never been scanned", async () => {
    expect(await get()).toEqual({ pending: 1, state: null });
  });

  it("counts a readable site whose page text was never saved", async () => {
    const { db, schema: s } = await import("@/db");
    db.insert(s.enrichment).values({ placeId: "P", kind: "site_scan", source: "site-scan", data: { outcome: "ok", services: null, signals: {} } }).run();
    expect(await get()).toEqual({ pending: 1, state: null });
  });

  it("counts nothing once its scan and its page text are current", async () => {
    const { db, schema: s } = await import("@/db");
    const { packText } = await import("@/lib/page-text");
    db.insert(s.pageTexts).values({ placeId: "P", text: packText("Epoxy floors in Houston") }).run();
    expect(await get()).toEqual({ pending: 0, state: null });
  });

  it("counts a scan that predates site text", async () => {
    const { db, schema: s } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    db.update(s.enrichment).set({ data: { outcome: "ok", signals: {} } }).where(eq(s.enrichment.placeId, "P")).run();
    expect(await get()).toEqual({ pending: 1, state: null });
  });

  it("refuses to start when there is nothing to refresh", async () => {
    const { db, schema: s } = await import("@/db");
    const { emptyPlaybook } = await import("@/lib/playbook");
    const empty = db.insert(s.niches).values({ name: "Empty", target: "", playbook: emptyPlaybook() }).returning().get().id;
    const res = await route.POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: String(empty) }) });
    expect(res.status).toBe(409);
  });
});
