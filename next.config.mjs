const basePath = "/portfolio-statistics";

/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath
  }
};

export default nextConfig;
