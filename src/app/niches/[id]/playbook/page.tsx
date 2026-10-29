import { notFound } from "next/navigation";
import { FadeIn } from "@/components/fade-in";
import NicheForm from "@/components/niche-form";
import { getNiche } from "@/lib/queries";
import { playbookSchema } from "@/lib/playbook";

export default async function PlaybookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const niche = getNiche(Number(id));
  if (!niche) notFound();
  return (
    <FadeIn className="mx-auto max-w-6xl">
      <h1 className="mb-6 text-2xl font-semibold">Edit playbook: {niche.name}</h1>
      <NicheForm
        mode="edit"
        nicheId={niche.id}
        initial={{ name: niche.name, presetKey: niche.presetKey, target: niche.target, playbook: playbookSchema.parse(niche.playbook) }}
      />
    </FadeIn>
  );
}
