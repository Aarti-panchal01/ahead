import type { Metadata } from "next";

export const metadata: Metadata = { title: "Before you take a photo" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
