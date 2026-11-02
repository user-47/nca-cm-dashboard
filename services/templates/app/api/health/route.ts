import { listTemplates } from "../../../templates/registry";

export const dynamic = "force-dynamic";

/** Used by compose healthchecks and by render-api before it trusts this service. */
export function GET() {
  return Response.json({
    status: "ok",
    templates: listTemplates().map((t) => `${t.id}@${t.version}`),
  });
}
