import type { Metadata } from "next";
import { FeatureStatus } from "@/components/feature-status/FeatureStatus";

export const metadata: Metadata = {
  title: "Browse areas — feature unavailable",
  description: "MMWR area browsing is being prepared. No real public boundary or post data is available here yet.",
  robots: { index: false, follow: false },
};

export default function AreasPage() { return <FeatureStatus feature="areas" />; }
