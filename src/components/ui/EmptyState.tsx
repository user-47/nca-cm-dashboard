import type { LucideIcon } from "lucide-react";

/**
 * Empty states invite the next action. Never a blank panel, never a bare
 * spinner: say what is not here yet and what to do about it.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      {Icon ? (
        <span
          className="mb-4 flex h-11 w-11 items-center justify-center rounded-full"
          style={{ background: "rgba(27,36,48,0.05)" }}
        >
          <Icon className="h-5 w-5 text-ink-muted" strokeWidth={1.75} aria-hidden />
        </span>
      ) : null}
      <h2 className="text-lg">{title}</h2>
      <p className="mt-2 max-w-sm text-sm text-ink-muted">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
