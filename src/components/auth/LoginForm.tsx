"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const data = new FormData(event.currentTarget);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Sign in did not go through. Try again.");
        setBusy(false);
        return;
      }

      router.push("/projects");
      router.refresh();
    } catch {
      setError("The server could not be reached. Check that it is running.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
        />
      </Field>

      <Field label="Password" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      {error ? (
        <p
          role="alert"
          className="rounded px-3 py-2 text-sm text-[var(--error)]"
          style={{ background: "color-mix(in srgb, var(--error) 8%, transparent)" }}
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" disabled={busy} className="mt-1 w-full">
        {busy ? "Signing in" : "Sign in"}
      </Button>
    </form>
  );
}
