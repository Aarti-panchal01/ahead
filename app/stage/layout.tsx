import type { Metadata } from "next";

export const metadata: Metadata = { title: "Has your hair loss started" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
