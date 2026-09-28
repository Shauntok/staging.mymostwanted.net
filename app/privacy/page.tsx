import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy notice (draft)",
  description: "Draft MMWR privacy notice. Pending review by Malaysia counsel before Production use.",
  robots: { index: false, follow: false },
};

export default function PrivacyPage() { return <LegalPage page="privacy" />; }
