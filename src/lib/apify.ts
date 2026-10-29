import { parseDatasetJson } from "./normalize";
import type { ApifyPlan, Shape } from "./geo";

// Overridable so the run/poll/ingest flow can be exercised against a local mock.
const API = process.env.APIFY_API_BASE ?? "https://api.apify.com/v2";

export const MAPS_ACTOR = () => process.env.APIFY_MAPS_ACTOR_ID || "scraperlink/google-maps-scraper";
export const PLAN = (): ApifyPlan => {
  const p = (process.env.APIFY_PLAN ?? "free").toLowerCase();
  return (["free", "starter", "scale", "business"] as const).find((x) => x === p) ?? "free";
};
/** Hard per-run spend cap passed to Apify as maxTotalChargeUsd. */
export const RUN_COST_CAP_USD = () => Number(process.env.RUN_COST_CAP_USD ?? 5);

/** Fields we ask the actor to return. Provenance fields are required for coverage. */
export const KEEP_FIELDS = [
  "placeId", "cid", "title", "categories",
  "address", "street", "city", "state", "postalCode", "countryCode",
  "phone", "phoneUnformatted", "website", "domain",
  "totalScore", "reviewsCount", "permanentlyClosed", "temporarilyClosed",
  "location", "openingHours", "bookingLinks",
  "imageUrl", "thumbnailUrl", "logoUrl", "imagesCount",
  "query", "searchString", "searchCenter", "searchGridIndex",
];

export type MapsInputOpts = {
  queries: string[];
  shape: Shape;
  gridSpacingKm: number;
  num: number;
  skipClosedPlaces: boolean;
  gl: string;
  hl: string;
};

export function buildMapsInput(o: MapsInputOpts): Record<string, unknown> {
  const input: Record<string, unknown> = {
    query: o.queries,
    num: o.num,
    gl: o.gl,
    hl: o.hl,
    skipClosedPlaces: o.skipClosedPlaces,
    gridSpacingKm: o.gridSpacingKm,
    fields: KEEP_FIELDS.join(","),
  };
  // radius OR polygon, never both
  if (o.shape.shape === "radius") {
    input.latitude = o.shape.centerLat;
    input.longitude = o.shape.centerLng;
    input.radiusKm = o.shape.radiusKm;
  } else {
    input.polygon = o.shape.polygon; // [lat, lng] pairs
  }
  return input;
}

function token(): string {
  const t = process.env.APIFY_TOKEN;
  if (!t) throw new Error("APIFY_TOKEN is not set. Add it to .env.local and restart.");
  return t;
}

async function call(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Apify ${res.status} on ${path.split("?")[0]}: ${body.slice(0, 300)}`);
  }
  return res;
}

const actorPath = (id: string) => id.replace("/", "~");

export type ApifyRun = {
  id: string;
  status: string;
  defaultDatasetId: string;
  startedAt?: string;
  finishedAt?: string;
  usageTotalUsd?: number;
  statusMessage?: string;
};

export async function startRun(input: Record<string, unknown>, maxChargeUsd: number): Promise<ApifyRun> {
  const res = await call(
    `/acts/${actorPath(MAPS_ACTOR())}/runs?maxTotalChargeUsd=${encodeURIComponent(String(maxChargeUsd))}`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return (await res.json()).data as ApifyRun;
}

export async function getRun(runId: string): Promise<ApifyRun> {
  const res = await call(`/actor-runs/${runId}`);
  return (await res.json()).data as ApifyRun;
}

export async function abortRun(runId: string): Promise<void> {
  await call(`/actor-runs/${runId}/abort`, { method: "POST" });
}

/** Fetch the whole dataset in pages, keeping 19-digit cids exact. */
export async function fetchDataset(datasetId: string, pageSize = 1000): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const res = await call(
      `/datasets/${datasetId}/items?format=json&clean=true&limit=${pageSize}&offset=${offset}`,
    );
    const page = parseDatasetJson(await res.text());
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

export const TERMINAL = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);
