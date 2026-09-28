import type { Metadata } from "next";
import { FeatureStatus } from "@/components/feature-status/FeatureStatus";

export const metadata: Metadata = {
  title: "Submit a post — feature unavailable",
  description: "MMWR submission is being prepared. Sign-in, registration and submission are unavailable.",
  robots: { index: false, follow: false },
};

export default function SubmitPage() { return <FeatureStatus feature="submit" />; }
