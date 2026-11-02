import { z } from "zod";

/**
 * Typed client for render-api.
 *
 * The dashboard calls this only from the server — route handlers, never the
 * browser — so render-api stays on the compose network and needs no auth of its
 * own. This package is the single place that knows its wire format.
 */

export const renderResult = z.object({
  url: z.string().url(),
  key: z.string(),
  assetId: z.string().uuid(),
  bytes: z.number().int(),
  renderMs: z.number().int(),
});

export type RenderResult = z.infer<typeof renderResult>;

export type RenderRequest = {
  brandId: string;
  template: string;
  templateVersion?: string;
  params: Record<string, string | undefined>;
  width: number;
  height: number;
  format?: "png" | "jpeg";
  posterId?: string | null;
};

/** What render-api sends back when it refuses. */
type WireError = { error?: { code?: string; message?: string } };

export class RenderApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "RenderApiError";
  }
}

export type RenderClientOptions = {
  baseUrl: string;
  /** A render is seconds, not milliseconds. Generous, but not unbounded. */
  timeoutMs?: number;
};

export function createRenderClient({ baseUrl, timeoutMs = 60_000 }: RenderClientOptions) {
  const root = baseUrl.replace(/\/+$/, "");

  async function call<T>(
    path: string,
    init: RequestInit,
    parse: (data: unknown) => T
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${root}${path}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      const timedOut = cause instanceof Error && cause.name === "TimeoutError";
      throw new RenderApiError(
        504,
        timedOut ? "RENDER_TIMEOUT" : "RENDER_UNREACHABLE",
        timedOut
          ? "The poster took too long to draw. Try again, and check the render service if it keeps happening."
          : "The poster service could not be reached. Check that render-api is running."
      );
    }

    const body: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      const wire = body as WireError | null;
      throw new RenderApiError(
        res.status,
        wire?.error?.code ?? "RENDER_FAILED",
        // render-api writes its messages for the person, so pass them through
        // rather than substituting something vaguer.
        wire?.error?.message ?? "The poster could not be drawn."
      );
    }

    return parse(body);
  }

  return {
    async render(request: RenderRequest): Promise<RenderResult> {
      return call(
        "/render",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
        },
        (data) => renderResult.parse(data)
      );
    },

    async health(): Promise<{ status: string }> {
      return call("/health", { method: "GET" }, (data) => data as { status: string });
    },
  };
}

export type RenderClient = ReturnType<typeof createRenderClient>;
