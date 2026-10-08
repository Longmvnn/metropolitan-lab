import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // vinext applies this limit to every multipart upload, including /api/files.
    // The default (1 MB) rejected ordinary lecture notes; the route itself allows 45 MB per upload.
    serverActions: { bodySizeLimit: "50mb" },
  },
};

export default nextConfig;
