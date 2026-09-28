import type {Metadata} from "next";
import {AuthForms} from "@/components/auth/AuthForms";
export const metadata: Metadata = {title: "Reset password", robots: {index: false, follow: false}};
export default function ForgotPasswordPage() { return <div className="auth-page"><AuthForms mode="forgot"/></div>; }
