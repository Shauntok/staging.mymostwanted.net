import type { Metadata } from "next";
import { FeatureStatus } from "@/components/feature-status/FeatureStatus";

export const metadata: Metadata = {
  title: "VIP — feature unavailable",
  description: "MMWR VIP is being prepared. No timing, price or benefits have been confirmed.",
  robots: { index: false, follow: false },
};

export default function VipPage() { return <FeatureStatus feature="vip" />; }
