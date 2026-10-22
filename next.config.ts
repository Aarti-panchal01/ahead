import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server routes read these files at runtime; make sure Vercel ships them with the functions.
  outputFileTracingIncludes: {
    "/api/**": ["./fixtures/youcam/**", "./assets/ai/faces/**", "./public/catalogue/**"],
  },
};

export default nextConfig;
