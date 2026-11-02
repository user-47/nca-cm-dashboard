import type { Page } from "playwright";
import { config } from "../lib/config";
import { logger } from "../lib/logger";
import { withContext } from "./pool";
import { ApiError } from "../lib/errors";

/**
 * Note there is no scale option.
 *
 * The handoff suggested deviceScaleFactor: 2 for crispness, but the templates
 * size themselves in real pixels: asking for 1080x1350 builds a 1080x1350
 * canvas. Doubling the device scale would return a 2160x2700 PNG for a request
 * that said 1080, contradicting the API's own width and height. Posters are
 * already at final resolution, so contexts run at scale 1 and the output is
 * exactly what was asked for. A genuine 2x print variant would need its own
 * pool at deviceScaleFactor 2, which is deferred rather than faked.
 */
export type ShotRequest = {
  url: string;
  width: number;
  height: number;
  format: "png" | "jpeg";
  quality?: number;
};

export type ShotResult = {
  buffer: Buffer;
  renderMs: number;
};

/**
 * Waits until the page is genuinely finished painting.
 *
 * `networkidle` is not enough on its own. Fonts and images are the two things
 * that routinely land after the network settles, and a screenshot taken a few
 * milliseconds early ships a poster in a fallback typeface or with a grey box
 * where the photo should be. Both failures look fine in code review and only
 * show up in the artifact.
 */
async function waitForPaint(page: Page, timeoutMs: number): Promise<void> {
  // The template marks its own root, so we know the component actually ran
  // rather than screenshotting an error boundary.
  await page.waitForSelector("[data-poster-root]", {
    state: "attached",
    timeout: timeoutMs,
  });

  /**
   * The in-page wait carries its own deadline.
   *
   * `page.evaluate` has no timeout of its own, so an image whose request never
   * settles — neither load nor error, just pending — hangs the promise forever.
   * That is not theoretical: it stalled a render here and held a pool context
   * hostage until the process was restarted, with the request simply never
   * returning. Anything that waits on the network needs a ceiling.
   */
  await page.evaluate(async (budgetMs) => {
    const deadline = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), budgetMs)
    );

    const settled = (async () => {
      await document.fonts.ready;

      await Promise.all(
        Array.from(document.images).map((img) => {
          // `complete` is true once the image has finished either way, so a
          // request that already failed is done and must not be waited on. It
          // used to also require naturalWidth > 0, which meant an image that had
          // broken before this ran fell through to listeners for load and error
          // events that had already fired — and nothing ever resolved it. One
          // bad URL then burned the whole render budget holding a pool context.
          if (img.complete) return null;
          return new Promise<void>((resolve) => {
            // Resolve on error too: a broken image should produce a poster with
            // a gap, not a request that blocks the whole render.
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          });
        })
      );

      // One more frame so the final layout reaches the compositor.
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      return "ready" as const;
    })();

    return Promise.race([settled, deadline]);
  }, Math.max(1000, timeoutMs - 2000)).then((outcome) => {
    if (outcome === "timeout") {
      throw new ApiError(
        422,
        "PAINT_TIMEOUT",
        "The poster did not finish loading its fonts and images in time. An image URL that never responds is the usual cause."
      );
    }
  });
}

export async function screenshot(req: ShotRequest): Promise<ShotResult> {
  const { RENDER_TIMEOUT_MS } = config();
  const started = Date.now();

  const buffer = await withContext(async (context) => {
    const page = await context.newPage();
    try {
      await page.setViewportSize({ width: req.width, height: req.height });

      let response;
      try {
        response = await page.goto(req.url, {
          waitUntil: "networkidle",
          timeout: RENDER_TIMEOUT_MS,
        });
      } catch (cause) {
        // Almost always a page whose network never goes quiet, which in
        // practice means an image or font URL that hangs.
        throw new ApiError(
          504,
          "TEMPLATE_TIMEOUT",
          "The poster page did not settle in time. Check that every image URL it references responds.",
          { url: req.url }
        );
      }

      if (!response) {
        throw new ApiError(
          502,
          "TEMPLATES_UNREACHABLE",
          "The templates service did not respond. Check that it is running."
        );
      }
      if (!response.ok()) {
        throw response.status() === 404
          ? new ApiError(
              404,
              "TEMPLATE_RENDER_404",
              "That brand or template does not exist."
            )
          : new ApiError(
              502,
              "TEMPLATES_ERROR",
              `The templates service answered ${response.status()}.`
            );
      }

      await waitForPaint(page, RENDER_TIMEOUT_MS);

      return await page.screenshot({
        type: req.format,
        // The frame is the viewport. fullPage would grow with any overflow and
        // silently produce a poster of the wrong size.
        fullPage: false,
        omitBackground: false,
        scale: "css",
        ...(req.format === "jpeg" ? { quality: req.quality ?? 92 } : {}),
        timeout: RENDER_TIMEOUT_MS,
      });
    } finally {
      await page.close().catch(() => {});
    }
  });

  const renderMs = Date.now() - started;
  logger.debug({ url: req.url, renderMs, bytes: buffer.length }, "screenshot taken");

  return { buffer, renderMs };
}
