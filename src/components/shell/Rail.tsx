"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderOpen,
  Megaphone,
  Scissors,
  Image as ImageIcon,
  Palette,
  Languages,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/projects", label: "Projects", icon: FolderOpen },
  { href: "/announcements", label: "Announcements", icon: Megaphone },
  { href: "/shorts", label: "Shorts", icon: Scissors },
  { href: "/posters", label: "Posters", icon: ImageIcon },
  { href: "/brands", label: "Brands", icon: Palette },
  { href: "/translation", label: "Translation", icon: Languages },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Rail() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      className={cn(
        // Bottom bar on a phone, left rail from md up. A volunteer checking
        // job status on their phone gets the same navigation.
        "fixed inset-x-0 bottom-0 z-20 flex shrink-0 border-t bg-surface",
        "md:static md:h-auto md:w-52 md:flex-col md:border-r md:border-t-0 md:py-4"
      )}
      style={{ borderColor: "var(--line)" }}
    >
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex flex-1 flex-col items-center gap-1 px-1 py-2.5 text-xs font-medium",
              "md:flex-none md:flex-row md:gap-3 md:px-4 md:py-2 md:text-sm",
              "transition-colors",
              active
                ? "text-[var(--brass)]"
                : "text-ink-muted hover:text-ink md:hover:bg-[rgba(27,36,48,0.04)]"
            )}
          >
            {/* Active marker: a brass edge on the rail, a top line on mobile. */}
            <span
              aria-hidden
              className={cn(
                "absolute bg-brass transition-opacity",
                "inset-x-3 top-0 h-0.5 md:inset-x-auto md:left-0 md:top-1 md:h-[calc(100%-0.5rem)] md:w-0.5",
                active ? "opacity-100" : "opacity-0"
              )}
            />
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
