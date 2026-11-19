import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { withParams } from "@/lib/url";

/** Previous / next links that keep the rest of the query string. Renders nothing for a single page. */
export function Pager({
  base,
  sp,
  page,
  pages,
  total,
  noun,
}: {
  base: string;
  sp: Record<string, string | string[] | undefined>;
  page: number;
  pages: number;
  total: number;
  noun: string;
}) {
  if (pages <= 1) return null;
  const link = "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm hover:bg-muted";
  const off = "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm opacity-40";
  const to = (p: number) => withParams(base, sp, { page: p === 1 ? null : String(p) });
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>{total} {noun} · page {page} of {pages}</span>
      <div className="flex gap-2">
        {page > 1 ? <Link href={to(page - 1)} scroll={false} className={link}><ChevronLeft className="size-4" /> Previous</Link> : <span className={off}><ChevronLeft className="size-4" /> Previous</span>}
        {page < pages ? <Link href={to(page + 1)} scroll={false} className={link}>Next <ChevronRight className="size-4" /></Link> : <span className={off}>Next <ChevronRight className="size-4" /></span>}
      </div>
    </div>
  );
}
