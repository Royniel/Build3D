import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Nothing exotic. Every backend call happens server-side (server components
  // and server actions), so there is no CORS configuration to get wrong and no
  // API token ever reaches the browser.
  reactStrictMode: true,
  output: "standalone",
};

export default nextConfig;
