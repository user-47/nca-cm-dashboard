/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The brand schema lives in the dashboard's src/db, outside this app's root.
  // Importing it directly keeps one definition of the tables rather than a
  // second copy here that could silently drift.
  experimental: {
    externalDir: true,
  },
  serverExternalPackages: ["pg"],
  output: "standalone",
  // This app lives in a workspace and imports from outside its own directory,
  // so tracing has to start at the repo root or the standalone bundle ships
  // without @nca/brand-tokens and the dashboard's schema.
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  // Every response here is a live render of database state, and Playwright must
  // never be handed a stale frame.
  async headers() {
    return [
      {
        source: "/render/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
