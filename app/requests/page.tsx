import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Correction, appeal and removal requests (draft)",
  description: "Draft MMWR request guidance. Account and contact workflows are not connected; Malaysia counsel review is pending.",
  robots: { index: false, follow: false },
};

export default function RequestsPage() { return <LegalPage page="requests" />; }
