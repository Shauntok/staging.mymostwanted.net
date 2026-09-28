import type { Metadata } from "next";
import { FeatureStatus } from "@/components/feature-status/FeatureStatus";

export const metadata: Metadata = {
  title: "My submissions — feature unavailable",
  description: "MMWR submission history is being prepared. Sign-in, registration, submission and history are unavailable.",
  robots: { index: false, follow: false },
};

export default function SubmissionsPage() { return <FeatureStatus feature="submissions" />; }
