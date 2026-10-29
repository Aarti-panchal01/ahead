import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Server routes read these files at runtime; make sure Vercel ships them with the functions.
  outputFileTracingIncludes: {
    "/api/**": ["./fixtures/youcam/**", "./assets/ai/faces/**", "./public/catalogue/**"],
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
