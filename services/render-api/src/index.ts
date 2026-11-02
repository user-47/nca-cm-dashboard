import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { ZodError } from "zod";
import { config } from "./lib/config";
import { logger } from "./lib/logger";
import { closeDb } from "./lib/db";
import { startPool, stopPool } from "./playwright/pool";
import { ApiError } from "./lib/errors";
import { healthRoutes } from "./routes/health";
import { renderRoutes } from "./routes/render";
import { extractStyleRoutes } from "./routes/extract-style";

async function main() {
  const c = config();

  const app = Fastify({
    loggerInstance: logger,
    // A render payload carries params and URLs, never a file, so this is
    // generous. Uploads for style extraction get their own limit in Task 7.
    bodyLimit: 1_000_000,
    requestIdHeader: "x-request-id",
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      /**
       * The body goes in the log, not just the code. A PAINT_TIMEOUT says a
       * poster failed but not which one, and reproducing it meant reading the
       * database to work out what had been rendered. Params are template text
       * and object keys, never bytes or credentials, so they are safe to log
       * and they are exactly what a person needs to reproduce the failure.
       */
      const body = request.body as Record<string, unknown> | undefined;
      request.log.warn(
        {
          code: error.code,
          err: error.message,
          template: body?.template,
          brandId: body?.brandId,
          width: body?.width,
          height: body?.height,
          params: body?.params,
        },
        "request refused"
      );
      return reply.code(error.status).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
    }

    if (error instanceof ZodError) {
      const first = error.issues[0];
      return reply.code(400).send({
        error: {
          code: "VALIDATION_FAILED",
          message: first
            ? `${first.path.join(".")}: ${first.message}`
            : "That request was not valid.",
          details: error.issues,
        },
      });
    }

    // Anything unrecognised is ours. Log it in full, tell the caller nothing
    // beyond the request id they can quote back.
    request.log.error({ err: error }, "unhandled error");
    return reply.code(500).send({
      error: {
        code: "INTERNAL",
        message: "The render failed. Check the render-api log for this request id.",
        details: { requestId: request.id },
      },
    });
  });

  // Style-reference uploads are the only route that takes a file. The cap
  // matches the extractor's own limit so an oversized image is refused at the
  // door rather than after it has been buffered.
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

  await app.register(healthRoutes);
  await app.register(renderRoutes);
  await app.register(extractStyleRoutes);

  // The pool is started before listening, so nothing is served until a browser
  // is genuinely available.
  await startPool();

  await app.listen({ port: c.PORT, host: c.HOST });
  logger.info({ port: c.PORT, templates: c.TEMPLATES_URL }, "render-api listening");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    await app.close();
    await stopPool();
    await closeDb();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((cause) => {
  logger.error({ err: cause }, "render-api failed to start");
  process.exit(1);
});
