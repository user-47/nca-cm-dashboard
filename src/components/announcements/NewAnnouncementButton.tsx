"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

export function NewAnnouncementButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "That did not go through. Try again.");
        setBusy(false);
        return;
      }
      router.push(`/announcements/${body.id}`);
    } catch {
      setError("The server could not be reached. Check that it is running.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" strokeWidth={1.9} aria-hidden />
        Create announcement
      </Button>
    );
  }

  return (
    <form onSubmit={create} className="card flex w-full max-w-md flex-col gap-3 p-4">
      <Field label="Title" htmlFor="new-title">
        <Input
          id="new-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Announcements, Sunday 17 August"
          autoFocus
          required
        />
      </Field>
      {error ? (
        <p role="alert" className="text-sm text-[var(--error)]">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={busy || !title.trim()}>
          {busy ? "Creating" : "Create announcement"}
        </Button>
        <Button onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
