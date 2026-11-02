import { Languages } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata = { title: "Translation" };

export default function TranslationPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl">Translation</h1>
        <p className="mt-1 text-sm text-ink-muted">
          A delayed French feed of the live service. Listeners run about a minute
          behind the room.
        </p>
      </div>
      <EmptyState
        icon={Languages}
        title="Translation arrives in a later release"
        body="Captions come first, then the dubbed audio feed. Both are delayed by design, not simultaneous interpretation."
      />
    </div>
  );
}
