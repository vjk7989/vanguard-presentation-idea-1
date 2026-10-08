import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{
      source: "/:path*",
      has: [{ type: "host", value: "vanguard-presentation-idea-1-ze6x.vercel.app" }],
      destination: "https://vanguard-presentation-idea-1.vercel.app/:path*",
      permanent: false,
    }];
  },
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  experimental: { cpus: 2 },
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
