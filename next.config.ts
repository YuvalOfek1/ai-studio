import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["bullmq", "ioredis"],
  experimental: {
    // generated media can be large; allow generous request bodies for uploads
    serverActions: { bodySizeLimit: "50mb" },
  },
};

export default config;
