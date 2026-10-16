import type {Metadata} from "next";
import {ProfileSetupForm} from "@/components/auth/ProfileSetupForm";
import {safeAccountReturnTo} from "@/lib/auth-return";
export const metadata: Metadata = {title: "Complete account setup", robots: {index: false, follow: false}};
export default async function CompleteProfilePage({searchParams}:{searchParams:Promise<{next?:string|string[]}>}) { const params=await searchParams; const redirectTo=typeof params.next==="string"?safeAccountReturnTo(params.next):"/account"; return <div className="auth-page"><ProfileSetupForm redirectTo={redirectTo}/></div>; }
