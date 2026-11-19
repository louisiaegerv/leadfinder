import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { db } from "@/db";
import { settings } from "@/db/schema";
import {
  BLUR_MAX,
  DEFAULT_APPEARANCE,
  DEFAULT_BLUR,
  DEFAULT_OVERLAY,
  OVERLAY_MAX,
  isPresetId,
  presetUrl,
  type Appearance,
  type PresetId,
  type Region,
  type RegionAppearance,
} from "./appearance-config";

const KEY = "appearance";
const MAX_SIDE = 2560;

type StoredRegion = { image: string | null; blur: number; overlay: number };
type Stored = Record<Region, StoredRegion>;

/** Uploads live beside the database, so they stay together with `data/` (and out of git). */
const uploadDir = () => path.join(path.dirname(process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "leadfinder.db")), "backgrounds");

const UPLOAD_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;
const UPLOAD_PREFIX = "upload:";
const PRESET_PREFIX = "preset:";

const clamp = (n: unknown, lo: number, hi: number, fallback: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;

/** A stored image reference that points at nothing real is treated as no image. */
function validImage(v: unknown): string | null {
  if (typeof v !== "string") return null;
  if (v.startsWith(PRESET_PREFIX)) return isPresetId(v.slice(PRESET_PREFIX.length)) ? v : null;
  if (v.startsWith(UPLOAD_PREFIX)) return UPLOAD_NAME.test(v.slice(UPLOAD_PREFIX.length)) ? v : null;
  return null;
}

function readStored(): Stored {
  const row = db.select().from(settings).where(eq(settings.key, KEY)).get()?.value;
  const raw = row && typeof row === "object" ? (row as Record<string, Partial<StoredRegion> | undefined>) : {};
  const one = (r: Partial<StoredRegion> | undefined): StoredRegion => ({
    image: validImage(r?.image),
    blur: clamp(r?.blur, 0, BLUR_MAX, DEFAULT_BLUR),
    overlay: clamp(r?.overlay, 0, OVERLAY_MAX, DEFAULT_OVERLAY),
  });
  return { sidebar: one(raw.sidebar), main: one(raw.main) };
}

function writeStored(value: Stored) {
  db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
}

/** Where a browser can fetch the image: a bundled preset from /public, or an upload from our own route. */
function imageUrl(image: string | null): string | null {
  if (!image) return null;
  if (image.startsWith(PRESET_PREFIX)) return presetUrl(image.slice(PRESET_PREFIX.length) as PresetId);
  return `/api/backgrounds/${image.slice(UPLOAD_PREFIX.length)}`;
}

const toPublic = (r: StoredRegion): RegionAppearance => ({ imageUrl: imageUrl(r.image), blur: r.blur, overlay: r.overlay });

export function getAppearance(): Appearance {
  try {
    const s = readStored();
    return { sidebar: toPublic(s.sidebar), main: toPublic(s.main) };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

/** Delete an upload we no longer use. Presets are shared static files and are never touched. */
function dropUpload(image: string | null) {
  if (!image?.startsWith(UPLOAD_PREFIX)) return;
  const file = resolveUpload(image.slice(UPLOAD_PREFIX.length));
  try {
    if (file) fs.rmSync(file, { force: true });
  } catch {
    // The new setting is already saved. A file we could not delete is only wasted disk space.
  }
}

/** Set the image of one region (or clear it with null), removing the old file if it was an upload. Returns the region. */
function replaceImage(region: Region, image: string | null): RegionAppearance {
  const s = readStored();
  const old = s[region].image;
  s[region].image = image;
  writeStored(s);
  if (old !== image) dropUpload(old);
  return toPublic(s[region]);
}

export function updateStyle(region: Region, style: { blur?: number; overlay?: number }): RegionAppearance {
  const s = readStored();
  if (style.blur !== undefined) s[region].blur = clamp(style.blur, 0, BLUR_MAX, s[region].blur);
  if (style.overlay !== undefined) s[region].overlay = clamp(style.overlay, 0, OVERLAY_MAX, s[region].overlay);
  writeStored(s);
  return toPublic(s[region]);
}

export function setPreset(region: Region, id: PresetId): RegionAppearance {
  return replaceImage(region, `${PRESET_PREFIX}${id}`);
}

export function clearBackground(region: Region): RegionAppearance {
  return replaceImage(region, null);
}

/**
 * Turn an uploaded picture into a web-friendly WebP: phone photos are rotated upright, shrunk to fit
 * 2560 px (never enlarged) and re-encoded. Throws if the bytes are not an image sharp can read.
 */
export async function setBackground(region: Region, bytes: Buffer): Promise<RegionAppearance> {
  const webp = await sharp(bytes)
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const name = `${crypto.randomUUID()}.webp`;
  fs.mkdirSync(uploadDir(), { recursive: true });
  fs.writeFileSync(path.join(uploadDir(), name), webp);
  try {
    return replaceImage(region, `${UPLOAD_PREFIX}${name}`);
  } catch (e) {
    fs.rmSync(path.join(uploadDir(), name), { force: true });
    throw e;
  }
}

/** Absolute path of an uploaded background, or null for anything that is not one of our own file names. */
export function resolveUpload(name: string): string | null {
  return UPLOAD_NAME.test(name) ? path.join(uploadDir(), name) : null;
}
