/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // pg and the argon2 native binding must stay outside the server bundler.
    serverComponentsExternalPackages: ["pg", "@node-rs/argon2"],
  },
  // The workspace packages export TypeScript source rather than built output,
  // so Next has to compile them alongside this app.
  transpilePackages: ["@nca/brand-tokens", "@nca/render-client"],
  output: "standalone",
};

export default nextConfig;
