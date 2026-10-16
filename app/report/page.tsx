import type {Metadata} from "next";
import {ReportCenter} from "@/components/reports/ReportCenter";
import {createSupabaseServerClient} from "@/lib/supabase/server";

export const metadata:Metadata={title:"Feedback & reports — MMWR",robots:{index:false,follow:false}};

export default async function ReportPage(){
  let signedIn=false;let active=false;
  try{
    const supabase=await createSupabaseServerClient();
    const {data:{user}}=await supabase.auth.getUser();
    signedIn=Boolean(user);
    if(user){
      const {data:profile,error}=await supabase.from("profiles").select("account_state").eq("id",user.id).maybeSingle();
      active=!error&&profile?.account_state==="active";
    }
  }catch{}
  return <ReportCenter signedIn={signedIn} active={active} turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()||null}/>;
}
