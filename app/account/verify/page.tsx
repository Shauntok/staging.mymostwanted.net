import type {Metadata} from "next";
import {AuthForms} from "@/components/auth/AuthForms";
import {verificationAuthFormProps} from "@/lib/auth/account-auth-form-props.mjs";
export const metadata: Metadata = {title: "Verify email", robots: {index: false, follow: false}};
export default function VerifyEmailPage() {
  const authFormProps=verificationAuthFormProps(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  return <div className="auth-page"><AuthForms {...authFormProps}/></div>;
}
