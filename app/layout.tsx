import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Newsreader } from "next/font/google";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible({ variable: "--font-body", subsets: ["latin"], weight: ["400", "700"] });
const newsreader = Newsreader({ variable: "--font-headline", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Still Me",
  description: "Try on your next hair, before you lose this one.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${atkinson.variable} ${newsreader.variable}`}>{children}</body>
    </html>
  );
}
