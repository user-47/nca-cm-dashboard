import { chromium, type Browser, type BrowserContext } from "playwright";
import { config } from "../lib/config";
import { logger } from "../lib/logger";

/**
 * A small pool of reusable browser contexts.
 *
 * Launching Chromium per request costs roughly a second and leaks memory under
 * any real load, so one browser is launched at boot and a fixed number of
 * contexts are handed out and returned. Contexts, not pages: a context is the
 * isolation boundary, and reusing one across posters would share cookies and
 * caches between churches.
 *
 * Each context is discarded after a bounded number of uses. Chromium's memory
 * drifts upward across hundreds of pages, and recycling is cheaper than
 * discovering that at 2am.
 */

type Slot = {
  context: BrowserContext;
  uses: number;
};

let browser: Browser | null = null;
const idle: Slot[] = [];
let busy = 0;
const waiters: Array<(slot: Slot) => void> = [];
let closing = false;

/**
 * --no-sandbox is required because the container runs as a non-root user
 * without the kernel capabilities Chromium's sandbox wants.
 * --disable-dev-shm-usage stops Chromium using /dev/shm, which Docker caps at
 * 64MB by default; without it a complex page crashes the tab with no useful
 * error. compose also raises shm_size, so this is belt and braces.
 */
const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  // Anything that could make two renders of the same input differ.
  "--force-color-profile=srgb",
  "--disable-lcd-text",
  "--font-render-hinting=none",
  "--hide-scrollbars",
  "--mute-audio",
];

async function newSlot(): Promise<Slot> {
  if (!browser) throw new Error("The browser pool has not been started.");
  const context = await browser.newContext({
    // Fixed so text metrics cannot vary with the host's locale or clock.
    locale: "en-GB",
    timezoneId: "UTC",
    colorScheme: "light",
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
  });
  return { context, uses: 0 };
}

export async function startPool(): Promise<void> {
  const { PLAYWRIGHT_POOL_SIZE } = config();
  closing = false;

  browser = await chromium.launch({ args: LAUNCH_ARGS });

  for (let i = 0; i < PLAYWRIGHT_POOL_SIZE; i++) {
    idle.push(await newSlot());
  }

  logger.info({ size: PLAYWRIGHT_POOL_SIZE }, "browser pool ready");
}

export async function stopPool(): Promise<void> {
  closing = true;
  for (const slot of idle.splice(0)) {
    await slot.context.close().catch(() => {});
  }
  await browser?.close().catch(() => {});
  browser = null;
  logger.info("browser pool closed");
}

/**
 * Waits for a free context. Callers must always release, so acquire is only
 * ever used through `withContext` below.
 */
function acquire(timeoutMs: number): Promise<Slot> {
  if (closing) return Promise.reject(new Error("The render service is shutting down."));

  const ready = idle.pop();
  if (ready) {
    busy++;
    return Promise.resolve(ready);
  }

  return new Promise<Slot>((resolve, reject) => {
    const timer = setTimeout(() => {
      const i = waiters.indexOf(onFree);
      if (i >= 0) waiters.splice(i, 1);
      reject(
        new Error(
          "Every browser is busy and one did not free up in time. Try again, or raise PLAYWRIGHT_POOL_SIZE."
        )
      );
    }, timeoutMs);

    function onFree(slot: Slot) {
      clearTimeout(timer);
      busy++;
      resolve(slot);
    }

    waiters.push(onFree);
  });
}

async function release(slot: Slot, broken: boolean): Promise<void> {
  busy--;
  const { PLAYWRIGHT_CONTEXT_MAX_USES } = config();

  // A context that threw mid-render may be in an unknown state; replacing it is
  // cheaper than reasoning about what survived.
  const retire = broken || slot.uses >= PLAYWRIGHT_CONTEXT_MAX_USES;

  let next = slot;
  if (retire) {
    await slot.context.close().catch(() => {});
    if (closing) return;
    try {
      next = await newSlot();
    } catch (cause) {
      logger.error({ err: cause }, "could not replace a browser context");
      return;
    }
  }

  const waiter = waiters.shift();
  if (waiter) waiter(next);
  else idle.push(next);
}

/** Borrow a context, guaranteeing it is returned however the body exits. */
export async function withContext<T>(
  fn: (context: BrowserContext) => Promise<T>
): Promise<T> {
  const slot = await acquire(config().RENDER_TIMEOUT_MS);
  slot.uses++;
  let broken = false;
  try {
    return await fn(slot.context);
  } catch (cause) {
    broken = true;
    throw cause;
  } finally {
    await release(slot, broken);
  }
}

export function poolStats() {
  return {
    size: config().PLAYWRIGHT_POOL_SIZE,
    idle: idle.length,
    busy,
    waiting: waiters.length,
    started: browser !== null,
  };
}
