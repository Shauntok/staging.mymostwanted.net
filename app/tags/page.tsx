import type { Metadata } from "next";
import { FeatureStatus } from "@/components/feature-status/FeatureStatus";

export const metadata: Metadata = {
  title: "Tags — feature unavailable",
  description: "MMWR tag browsing is being prepared. No real public tag or post data is available here yet.",
  robots: { index: false, follow: false },
};

export default function TagsPage() { return <FeatureStatus feature="tags" />; }
