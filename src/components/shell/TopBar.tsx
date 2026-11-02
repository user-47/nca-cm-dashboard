import { LogOut } from "lucide-react";
import type { CurrentUser } from "@/lib/session";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function TopBar({ user }: { user: CurrentUser }) {
  return (
    <header
      className="flex h-14 shrink-0 items-center justify-between border-b bg-surface px-4 md:px-6"
      style={{ borderColor: "var(--line)" }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {/* Wordmark: a brass rule and the church name in the display face. */}
        <span aria-hidden className="h-5 w-1 rounded-sm bg-brass" />
        <span className="truncate font-display text-base font-semibold">
          {user.orgName}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-ink-muted sm:inline">{user.name}</span>
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{ background: "var(--forest)" }}
          title={`${user.name} (${user.role})`}
        >
          {initials(user.name)}
        </span>
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="flex h-8 w-8 items-center justify-center rounded text-ink-muted transition-colors hover:bg-[rgba(27,36,48,0.05)] hover:text-ink"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.9} aria-hidden />
          </button>
        </form>
      </div>
    </header>
  );
}
