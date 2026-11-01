import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/SessionProvider";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import NavigationScrollReset from "@/components/NavigationScrollReset";

export const metadata: Metadata = {
  title: { default: "Ahead — wigs and wraps, on you", template: "Ahead · %s" },
  applicationName: "Ahead",
  description: "A YouCam-powered wig and headwear try-on for people navigating treatment-related hair loss. Explore styles on your photo, compare favourites, and take a fitting brief to a specialist.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <NavigationScrollReset />
          <SiteHeader />
          {children}
          <SiteFooter />
        </SessionProvider>
      </body>
    </html>
  );
}
