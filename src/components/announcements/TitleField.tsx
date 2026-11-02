"use client";

import { useState } from "react";

/** The title edits in place. No separate form, no save button. */
export function TitleField({ id, title }: { id: string; title: string }) {
  const [value, setValue] = useState(title);
  const [saved, setSaved] = useState(title);

  async function commit() {
    const next = value.trim();
    if (!next || next === saved) {
      setValue(saved);
      return;
    }
    setSaved(next);
    await fetch(`/api/announcements/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: next }),
    });
  }

  return (
    <input
      aria-label="Announcement title"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setValue(saved);
          e.currentTarget.blur();
        }
      }}
      className="w-full max-w-2xl rounded border border-transparent bg-transparent px-2 py-1 font-display text-xl font-semibold
                 transition-colors hover:border-[var(--line)] focus:border-[var(--line-strong)] focus:bg-surface"
    />
  );
}
