import type {Metadata} from "next";
import {AuthForms} from "@/components/auth/AuthForms";
export const metadata: Metadata = {title: "Verify email", robots: {index: false, follow: false}};
export default function VerifyEmailPage() { return <div className="auth-page"><AuthForms mode="verify"/></div>; }
