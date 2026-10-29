import { FadeIn } from "@/components/fade-in";
import NicheForm from "@/components/niche-form";
import { emptyPlaybook } from "@/lib/playbook";

export default function NewNichePage() {
  return (
    <FadeIn className="mx-auto max-w-6xl">
      <h1 className="mb-6 text-2xl font-semibold">New niche</h1>
      <NicheForm mode="create" initial={{ name: "", presetKey: null, target: "", playbook: emptyPlaybook() }} />
    </FadeIn>
  );
}
