# render-api.
#
# Based on Microsoft's Playwright image, which already carries Chromium and the
# system libraries it needs. Installing a browser into a plain node image means
# chasing a long list of shared objects, and getting one wrong surfaces as a
# blank screenshot rather than an error.
#
# The tag must equal the playwright version in package.json, and that version is
# pinned exactly rather than with a caret. A caret let npm resolve 1.62.1 against
# a 1.49.1 base image, and the container crash-looped on startup: the client
# looks for a browser build the image does not carry. Change one, change both.

FROM node:22-bookworm-slim AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/brand-tokens/package.json ./packages/brand-tokens/
COPY packages/render-client/package.json ./packages/render-client/
COPY services/templates/package.json ./services/templates/
COPY services/render-api/package.json ./services/render-api/
RUN npm ci --omit=dev --workspace @nca/render-api --include-workspace-root

FROM mcr.microsoft.com/playwright:v1.62.1-jammy AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
# The image ships browsers here; say so explicitly rather than relying on the
# base image's own environment surviving a future bump.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY --from=deps /repo/node_modules ./node_modules
COPY package.json ./
COPY packages ./packages
COPY services/render-api ./services/render-api
# The schema only, for the same reason as the templates image.
COPY src/db ./src/db

# Run TypeScript directly. The service imports the dashboard's schema from
# outside its own rootDir, which tsc will not emit cleanly across a workspace
# boundary, and a bundler would be a second build system to maintain for one
# small service. tsx costs a little startup time and nothing per request.
RUN npm install --no-save tsx@^4.19.2

USER pwuser
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=8s --start-period=40s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npx", "tsx", "services/render-api/src/index.ts"]
