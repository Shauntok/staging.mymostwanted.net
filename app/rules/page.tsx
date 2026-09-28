import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Community rules (draft)",
  description: "Draft MMWR community rules. Pending review by Malaysia counsel before Production use.",
  robots: { index: false, follow: false },
};

export default function RulesPage() { return <LegalPage page="rules" />; }
