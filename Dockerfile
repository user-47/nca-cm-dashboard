# Next standalone build. The runtime image carries no toolchain and no source.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --workspaces=false keeps this to the dashboard's own dependencies. The root
# package.json declares workspaces, but their manifests are not copied into this
# stage and the dashboard image has no business pulling Playwright.
RUN npm ci --workspaces=false

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next/font fetches the three typefaces at build time and bakes them into the
# output, so the running app never calls a font CDN. This step needs network.
RUN npm run build

# One-shot image for migrating and seeding. Kept separate because it needs the
# dev dependencies (tsx, drizzle-kit) that the runtime image should not carry.
FROM node:22-bookworm-slim AS migrator
WORKDIR /app
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY package.json drizzle.config.ts tsconfig.json ./
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY src/db ./src/db
COPY src/lib ./src/lib
CMD ["npm", "run", "db:migrate"]

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
