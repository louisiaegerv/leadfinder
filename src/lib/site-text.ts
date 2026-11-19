import { sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { enrichment } from "@/db/schema";

/** The saved quick scan of a business's website, and what the paid website reader found. Left join both on the business. */
export const scanRow = alias(enrichment, "scan_row");
export const profileRow = alias(enrichment, "profile_row");

/**
 * What a business's own website says about itself as one string for keyword matching: from the quick scan its page title,
 * description, headline, section headings and menu links and opening copy, and from the paid reader its description,
 * services and service area. Null when neither has run.
 */
export const siteTextSql = sql<string | null>`case when ${scanRow.data} is null and ${profileRow.data} is null then null else trim(
  coalesce(json_extract(${scanRow.data}, '$.title'), '') || ' ' ||
  coalesce(json_extract(${scanRow.data}, '$.description'), '') || ' ' ||
  coalesce(json_extract(${scanRow.data}, '$.heading'), '') || ' ' ||
  coalesce(json_extract(${scanRow.data}, '$.services'), '') || ' ' ||
  coalesce(json_extract(${scanRow.data}, '$.about'), '') || ' ' ||
  coalesce(json_extract(${profileRow.data}, '$.description'), '') || ' ' ||
  coalesce(json_extract(${profileRow.data}, '$.services'), '') || ' ' ||
  coalesce(json_extract(${profileRow.data}, '$.serviceArea'), '')) end`;

/** 1 when the quick scan ran but could not read the site (blocked, broken, built with JavaScript) and the paid reader has not read it either. */
export const siteUnreadSql = sql<number>`case when json_extract(${scanRow.data}, '$.outcome') is not null and json_extract(${scanRow.data}, '$.outcome') <> 'ok' and ${profileRow.data} is null then 1 else 0 end`;
