import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/projects");

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <span aria-hidden className="h-7 w-1 rounded-sm bg-brass" />
          <div>
            <p className="font-display text-lg font-semibold leading-tight">
              Creative Media
            </p>
            <p className="text-sm text-ink-muted">New Covenant Assembly</p>
          </div>
        </div>

        <div className="card p-6">
          <h1 className="text-lg">Sign in</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Use the email your church media lead set up for you.
          </p>
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
