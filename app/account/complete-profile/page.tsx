import type {Metadata} from "next";
import {ProfileSetupForm} from "@/components/auth/ProfileSetupForm";
export const metadata: Metadata = {title: "Complete account setup", robots: {index: false, follow: false}};
export default function CompleteProfilePage() { return <div className="auth-page"><ProfileSetupForm/></div>; }
