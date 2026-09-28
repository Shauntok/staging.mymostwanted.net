import type { Metadata } from "next";
import { FeatureStatus } from "@/components/feature-status/FeatureStatus";

export const metadata: Metadata = {
  title: "Latest posts — feature unavailable",
  description: "MMWR Latest posts are being prepared. No real public post data is available here yet.",
  robots: { index: false, follow: false },
};

export default function LatestPage() { return <FeatureStatus feature="latest" />; }
