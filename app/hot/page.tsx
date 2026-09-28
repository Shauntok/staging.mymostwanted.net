import type { Metadata } from "next";
import { FeatureStatus } from "@/components/feature-status/FeatureStatus";

export const metadata: Metadata = {
  title: "Hot Ranked — feature unavailable",
  description: "MMWR Hot Ranked is being prepared. No real public ranking or post data is available here yet.",
  robots: { index: false, follow: false },
};

export default function HotPage() { return <FeatureStatus feature="hot" />; }
