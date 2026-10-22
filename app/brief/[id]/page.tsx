import type { Metadata } from "next";
import BriefView from "@/components/brief/BriefView";

export const metadata: Metadata = { title: "Stylist brief · Ahead", robots: { index: false, follow: false } };

export default async function Brief({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BriefView id={decodeURIComponent(id)} />;
}
