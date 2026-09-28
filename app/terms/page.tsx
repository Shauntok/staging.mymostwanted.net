import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of use (draft)",
  description: "Draft MMWR terms of use. Pending review by Malaysia counsel before Production use.",
  robots: { index: false, follow: false },
};

export default function TermsPage() { return <LegalPage page="terms" />; }
