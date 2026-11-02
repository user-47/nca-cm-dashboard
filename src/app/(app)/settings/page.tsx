import { redirect } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { voices, assets } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { presignGet } from "@/lib/s3";
import { VoiceManager, type VoiceRow } from "@/components/settings/VoiceManager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const rows = await db
    .select({
      id: voices.id,
      name: voices.name,
      provider: voices.provider,
      providerVoiceId: voices.providerVoiceId,
      language: voices.language,
      isDefault: voices.isDefault,
      sampleKey: assets.minioKey,
    })
    .from(voices)
    .leftJoin(assets, eq(assets.id, voices.sampleAssetId))
    .where(and(eq(voices.orgId, user.orgId), isNull(voices.deletedAt)))
    .orderBy(asc(voices.name));

  const list: VoiceRow[] = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      name: row.name,
      provider: row.provider,
      providerVoiceId: row.providerVoiceId,
      language: row.language,
      isDefault: row.isDefault,
      sampleUrl: row.sampleKey ? await presignGet(row.sampleKey) : null,
    }))
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div>
        <h1 className="text-xl">Settings</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Signed in as {user.name} ({user.role}) at {user.orgName}.
        </p>
      </div>

      <VoiceManager initial={list} canEdit={user.role !== "reviewer"} />
    </div>
  );
}
