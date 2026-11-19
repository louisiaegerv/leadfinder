// Shared by the server (validation) and the client (slider limits), so it must not import anything from Node.

export const REGIONS = ["sidebar", "main"] as const;
export type Region = (typeof REGIONS)[number];
export const isRegion = (v: string): v is Region => (REGIONS as readonly string[]).includes(v);

export const REGION_LABEL: Record<Region, string> = { sidebar: "Sidebar", main: "Main area" };

export type RegionAppearance = {
  /** Public URL of the background, or null for none. */
  imageUrl: string | null;
  /** Blur in px. */
  blur: number;
  /** How much of the theme colour is laid over the image, in percent. Higher means the image shows less. */
  overlay: number;
};
export type Appearance = Record<Region, RegionAppearance>;

export const BLUR_MAX = 40;
export const OVERLAY_MAX = 100;
export const DEFAULT_BLUR = 6;
export const DEFAULT_OVERLAY = 75;

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export const PRESETS = [
  { id: "aurora", label: "Aurora" },
  { id: "dunes", label: "Dunes" },
  { id: "forest", label: "Misty forest" },
  { id: "city", label: "City at night" },
  { id: "waves", label: "Pastel waves" },
] as const;
export type PresetId = (typeof PRESETS)[number]["id"];
export const isPresetId = (v: string): v is PresetId => PRESETS.some((p) => p.id === v);

// Static files in public/backgrounds: a full-size image and a small thumbnail for the picker.
export const presetUrl = (id: PresetId) => `/backgrounds/${id}.webp`;
export const presetThumbUrl = (id: PresetId) => `/backgrounds/${id}-thumb.webp`;

export const DEFAULT_REGION: RegionAppearance = { imageUrl: null, blur: DEFAULT_BLUR, overlay: DEFAULT_OVERLAY };
export const DEFAULT_APPEARANCE: Appearance = { sidebar: { ...DEFAULT_REGION }, main: { ...DEFAULT_REGION } };
