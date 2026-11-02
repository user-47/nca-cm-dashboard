import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { Rail } from "@/components/shell/Rail";
import { TopBar } from "@/components/shell/TopBar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Theme overrides from orgs.theme_json land on the wrapper as inline custom
  // properties, so rebranding never touches a component.
  const themeVars = Object.fromEntries(
    Object.entries(user.theme ?? {}).map(([k, v]) => [
      k.startsWith("--") ? k : `--${k}`,
      v,
    ])
  ) as React.CSSProperties;

  return (
    <div className="flex min-h-dvh flex-col" style={themeVars}>
      <TopBar user={user} />
      <div className="flex flex-1">
        <Rail />
        {/* pb-20 keeps content clear of the mobile bottom bar. */}
        <main className="min-w-0 flex-1 px-4 pb-20 pt-6 md:px-8 md:pb-10">
          {children}
        </main>
      </div>
    </div>
  );
}
