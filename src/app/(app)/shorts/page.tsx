import { Scissors } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata = { title: "Shorts" };

export default function ShortsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl">Shorts</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Candidate clips from a sermon, for you to approve before anything renders.
        </p>
      </div>
      <EmptyState
        icon={Scissors}
        title="Shorts arrive in a later release"
        body="When it lands, a sermon produces a shortlist here and only the clips you approve get rendered."
      />
    </div>
  );
}
