import { cn } from "@/lib/utils";
import type { JobStatus } from "@/db/schema";

/**
 * Job status, said the way a person would say it. The database enum is an
 * implementation detail; nobody should read "awaiting_review" in the UI.
 */
const LABELS: Record<JobStatus, string> = {
  queued: "Queued",
  running: "Working",
  awaiting_review: "Needs review",
  rendering: "Rendering",
  complete: "Done",
  failed: "Stopped",
};

const STYLES: Record<JobStatus, string> = {
  queued: "bg-[rgba(27,36,48,0.07)] text-ink-muted",
  running: "bg-[color-mix(in_srgb,var(--brass)_16%,transparent)] text-[var(--brass)]",
  awaiting_review: "bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] text-[var(--warning)]",
  rendering: "bg-[color-mix(in_srgb,var(--brass)_16%,transparent)] text-[var(--brass)]",
  complete: "bg-[color-mix(in_srgb,var(--success)_16%,transparent)] text-[var(--success)]",
  failed: "bg-[color-mix(in_srgb,var(--error)_14%,transparent)] text-[var(--error)]",
};

const IN_FLIGHT: JobStatus[] = ["queued", "running", "rendering"];

export function StatusPill({
  status,
  className,
}: {
  status: JobStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        STYLES[status],
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full bg-current",
          IN_FLIGHT.includes(status) && "animate-working-pulse"
        )}
      />
      {LABELS[status]}
    </span>
  );
}
