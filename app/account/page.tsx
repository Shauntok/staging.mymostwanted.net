import type { Metadata } from "next";
import { FeatureStatus } from "@/components/feature-status/FeatureStatus";

export const metadata: Metadata = {
  title: "Account — feature unavailable",
  description: "MMWR accounts are being prepared. Sign-in, registration and submission are unavailable.",
  robots: { index: false, follow: false },
};

export default function AccountPage() { return <FeatureStatus feature="account" />; }
