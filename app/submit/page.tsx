import type { Metadata } from "next";
import {SubmissionDraft} from "@/components/submissions/SubmissionDraft";

export const metadata: Metadata = {
  title: "Submission form preview — MMWR",
  description: "Preview the MMWR submission form. Submissions are not accepted or saved.",
  robots: { index: false, follow: false },
};

export default function SubmitPage() { return <SubmissionDraft />; }
