import type {Metadata} from "next";
import {AuthForms} from "@/components/auth/AuthForms";
export const metadata: Metadata = {title: "Create account", robots: {index: false, follow: false}};
export default function SignupPage() { return <div className="auth-page"><AuthForms mode="signup"/></div>; }
