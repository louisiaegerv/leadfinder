import { deflateSync, inflateSync } from "node:zlib";

/** Most of one page's text that is kept. A front page averages about 6,000 characters, so this is almost always all of it. */
export const PAGE_TEXT_MAX = 12_000;

/** Page text is stored compressed (it shrinks to about a third), in a table of its own so no list query ever reads it. */
export const packText = (s: string): Buffer => deflateSync(Buffer.from(s, "utf8"));
export const unpackText = (b: Buffer): string => inflateSync(b).toString("utf8");
