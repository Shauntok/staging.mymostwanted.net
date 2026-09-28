import type { Metadata } from "next";
import { FeatureStatus } from "@/components/feature-status/FeatureStatus";

export const metadata: Metadata = {
  title: "Search — feature unavailable",
  description: "MMWR search is being prepared. No real public search results or post data is available here yet.",
  robots: { index: false, follow: false },
};

export default function SearchPage() { return <FeatureStatus feature="search" />; }
