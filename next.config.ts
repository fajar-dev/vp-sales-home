import type { NextConfig } from "next";

const rawBasePath =
  process.env.NEXT_PUBLIC_BASE_PATH || process.env.BASE_PATH || "/";
const basePath =
  rawBasePath === "/" ? "" : rawBasePath.trim().replace(/\/$/, "");

const nextConfig: NextConfig = {
  basePath: basePath,
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
