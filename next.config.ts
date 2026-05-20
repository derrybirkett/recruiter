import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/recruiter",
  images: { unoptimized: true },
};

export default nextConfig;
