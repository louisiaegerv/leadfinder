import { toast } from "sonner";

type ScanResponse = {
  scanned: number;
  outcomes: Record<string, number>;
  withSocials: number;
  facebookFound: number;
  ownersFound: number;
  needsBrowser: string[];
  paidStarted: number;
  paidError: string | null;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One summary of a website scan, whether it was one business or a batch. */
export function showScanResult(d: ScanResponse) {
  const read = d.outcomes.ok ?? 0;
  const unreadable = d.needsBrowser.length;
  const gone = (d.outcomes.dead ?? 0) + (d.outcomes.refused ?? 0) + (d.outcomes.not_html ?? 0);
  const parts = [
    `${read} read`,
    unreadable ? `${unreadable} need a browser` : null,
    gone ? `${gone} not reachable` : null,
  ].filter(Boolean);
  const found = [
    d.withSocials ? `${plural(d.withSocials, "site")} with social links` : null,
    d.facebookFound ? `${plural(d.facebookFound, "Facebook page")} linked` : null,
    d.ownersFound ? `${plural(d.ownersFound, "owner")} named` : null,
  ].filter(Boolean);
  const tail = d.paidStarted
    ? ` Sent ${plural(d.paidStarted, "site")} to the paid reader.`
    : unreadable && !d.paidError
      ? ` Use “Read website” on those to try the paid reader.`
      : "";
  toast.success(`Scanned ${plural(d.scanned, "website")}`, {
    description: `${parts.join(" · ")}${found.length ? `. ${found.join(", ")}` : ""}.${tail}`,
  });
  if (d.paidError) toast.error("The paid reader did not start", { description: d.paidError });
}
