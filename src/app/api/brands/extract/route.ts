import { requireUser } from "@/lib/session";
import { env } from "@/lib/env";
import { apiError, apiOk, handle } from "@/lib/api";

/**
 * Reads a brand out of an uploaded poster.
 *
 * The browser posts here, not to render-api. render-api has no auth of its own
 * and sits on the compose network on purpose, so this is where the session is
 * checked and where the church's id is attached. A browser that could call
 * render-api directly could read a brand into any org it liked.
 */
export const maxDuration = 120;

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    if (user.role === "reviewer") {
      return apiError("Reviewers cannot add brands. Ask an admin.", 403);
    }

    const incoming = await request.formData().catch(() => null);
    const file = incoming?.get("image");

    if (!(file instanceof File) || file.size === 0) {
      return apiError("Choose a poster image to read the brand from.", 400);
    }
    if (file.size > MAX_BYTES) {
      return apiError("That image is over 8 MB. Save it smaller and try again.", 413);
    }

    const forwarded = new FormData();
    forwarded.append("image", file, file.name || "reference");

    let res: Response;
    try {
      res = await fetch(`${env().RENDER_API_URL}/extract-style`, {
        method: "POST",
        headers: { "x-org-id": user.orgId },
        body: forwarded,
        // Reading a poster takes about ten seconds. This is headroom, not a
        // target, and it is bounded so a hung call cannot pin the route.
        signal: AbortSignal.timeout(110_000),
      });
    } catch (cause) {
      const timedOut = cause instanceof Error && cause.name === "TimeoutError";
      return apiError(
        timedOut
          ? "Reading that poster took too long. Try a smaller image."
          : "The poster service could not be reached. Check that render-api is running.",
        504
      );
    }

    const body = await res.json().catch(() => null);

    if (!res.ok) {
      // render-api writes its messages for the person, so pass them through.
      return apiError(
        body?.error?.message ?? "That poster could not be read.",
        res.status === 501 ? 501 : 422
      );
    }

    return apiOk(body);
  });
}
