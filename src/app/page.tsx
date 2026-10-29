import Link from "next/link";
import { Plus } from "lucide-react";
import { FadeIn } from "@/components/fade-in";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlaceThumb } from "@/components/place-thumb";
import { getNicheThumbs, listNiches } from "@/lib/queries";

export default function Home() {
  const all = listNiches();
  return (
    <FadeIn className="mx-auto max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Niches</h1>
          <p className="mt-1 text-sm text-muted-foreground">Each niche has its own playbook, areas, runs and pipeline. Places and contact history are shared.</p>
        </div>
        {all.length > 0 && (
          <Link href="/niches/new" className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted">
            <Plus className="size-4" /> New niche
          </Link>
        )}
      </div>

      {all.length === 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Start your first niche</CardTitle>
            <CardDescription>Pick a preset (flooring, painting, fencing, movers) or describe your own target.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/niches/new" className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
              <Plus className="size-4" /> New niche
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {all.map((n, i) => (
            <FadeIn key={n.id} delay={i * 0.04}>
              <Link href={`/niches/${n.id}`}>
                <Card className="h-full transition hover:border-blue-600/50">
                  <CardHeader>
                    <Faces nicheId={n.id} />
                    <CardTitle>{n.name}</CardTitle>
                    <CardDescription className="line-clamp-2">{n.target || "No target description"}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex gap-6 text-sm">
                    <Stat label="Areas" value={n.areaCount} />
                    <Stat label="Places" value={n.placeCount} />
                    <Stat label="Targets" value={n.targetCount} />
                  </CardContent>
                </Card>
              </Link>
            </FadeIn>
          ))}
        </div>
      )}
    </FadeIn>
  );
}

/** Overlapping photos of the niche's best-reviewed targets; renders nothing until there are some. */
function Faces({ nicheId }: { nicheId: number }) {
  const thumbs = getNicheThumbs(nicheId, 5);
  if (thumbs.length === 0) return null;
  return (
    <div className="mb-2 flex -space-x-2">
      {thumbs.map((t) => (
        <PlaceThumb key={t.placeId} title={t.title} imageUrl={t.imageUrl} thumbnailUrl={t.thumbnailUrl} size={36} className="rounded-lg ring-2 ring-card" />
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xl font-semibold tabular-nums">{value.toLocaleString()}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
