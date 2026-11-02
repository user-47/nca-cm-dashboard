# The templates app.
#
# Build context is the repo root, not this directory. The app imports
# @nca/brand-tokens from the workspace and the dashboard's Drizzle schema from
# src/db, so a context scoped to services/templates would be missing both.

FROM node:22-bookworm-slim AS deps
WORKDIR /repo
# Every workspace manifest, so `npm ci` can resolve the whole graph. Copied
# before the source so this layer caches across code changes.
COPY package.json package-lock.json ./
COPY packages/brand-tokens/package.json ./packages/brand-tokens/
COPY packages/render-client/package.json ./packages/render-client/
COPY services/templates/package.json ./services/templates/
COPY services/render-api/package.json ./services/render-api/
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /repo
# Two trees, and both are needed. npm hoists what it can to the root, but the
# repo contains two majors of Next — the dashboard is on 14, this app on 15 —
# so npm nests this app's copy. Without the nested tree the build resolves the
# dashboard's @next/swc against Next 15 and dies on a confusing webpack error.
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/services/templates/node_modules ./services/templates/node_modules
COPY package.json package-lock.json ./
COPY packages ./packages
COPY services/templates ./services/templates
# The schema only. Copying all of src would drag the dashboard into this image.
COPY src/db ./src/db
RUN npm run build --workspace @nca/templates

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# Next's standalone output already contains the traced node_modules, laid out
# relative to the tracing root, so the server path keeps the workspace shape.
COPY --from=build --chown=nextjs:nodejs /repo/services/templates/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /repo/services/templates/.next/static ./services/templates/.next/static
COPY --from=build --chown=nextjs:nodejs /repo/services/templates/public ./services/templates/public

USER nextjs
EXPOSE 3000

# No curl in this image, so the healthcheck is Node talking to itself.
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "services/templates/server.js"]
