import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { pageTexts } from "@/db/schema";
import { packText, unpackText } from "./page-text";

type Writer = Pick<typeof db, "insert">;

/** Keep (or replace) the page text of a business's website. Empty text is ignored, so a failed scan never wipes a good one. */
export function savePageText(tx: Writer, placeId: string, text: string | null | undefined) {
  if (!text) return;
  const packed = packText(text);
  const fetchedAt = new Date();
  tx.insert(pageTexts)
    .values({ placeId, text: packed, fetchedAt })
    .onConflictDoUpdate({ target: pageTexts.placeId, set: { text: packed, fetchedAt } })
    .run();
}

/** The saved page text of these businesses. Ones without any are simply absent. */
export function loadPageText(placeIds: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i < placeIds.length; i += 500) {
    const rows = db
      .select({ placeId: pageTexts.placeId, text: pageTexts.text })
      .from(pageTexts)
      .where(inArray(pageTexts.placeId, placeIds.slice(i, i + 500)))
      .all();
    for (const r of rows) out.set(r.placeId, unpackText(r.text));
  }
  return out;
}

/** Which of these businesses have saved page text, without reading it. */
export function havePageText(placeIds: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < placeIds.length; i += 500) {
    for (const r of db.select({ placeId: pageTexts.placeId }).from(pageTexts).where(inArray(pageTexts.placeId, placeIds.slice(i, i + 500))).all()) out.add(r.placeId);
  }
  return out;
}
