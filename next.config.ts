import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // The browser suite uses a separate build directory so it cannot disturb a running local dev server.
  distDir: process.env.AHEAD_NEXT_DIST_DIR || ".next",
  // Server routes read these files at runtime; make sure Vercel ships them with the functions.
  outputFileTracingIncludes: {
    "/api/**": ["./fixtures/youcam/**", "./assets/ai/faces/**", "./public/catalogue/**"],
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
