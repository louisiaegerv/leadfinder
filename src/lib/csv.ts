export type Cell = string | number | boolean | null | undefined;

const PHONE_OR_NUMBER = /^[+-]?[\d\s().-]+$/;

/**
 * Business names and notes come from Google and from people, so a cell that starts with = or @ would run as a
 * formula when the file is opened in Excel or Sheets. Those get a leading apostrophe, which spreadsheets hide.
 * Phone numbers and plain numbers (which may start with + or -) are left alone.
 */
function safe(text: string): string {
  if (/^[=@\t\r]/.test(text)) return `'${text}`;
  if (/^[+-]/.test(text) && !PHONE_OR_NUMBER.test(text)) return `'${text}`;
  return text;
}

function cell(v: Cell): string {
  if (v == null) return "";
  const text = typeof v === "string" ? safe(v) : String(v);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows to CSV text. Starts with a byte-order mark so Excel reads accents correctly. */
export function toCsv(header: string[], rows: Cell[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function csvResponse(name: string, body: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** A date-stamped file name, for example leadfinder-2026-10-29.db. */
export const stamped = (base: string, ext: string, now = new Date()) => `${base}-${now.toISOString().slice(0, 10)}.${ext}`;
