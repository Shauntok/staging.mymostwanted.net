import {createSupabaseServerClient} from "@/lib/supabase/server";
import {createSupabaseServiceClient} from "@/lib/supabase/service";
import {submitReportRequest} from "@/lib/reports/submit.mjs";
import {verifyTurnstile} from "@/lib/security/turnstile";

export const runtime="nodejs";

export async function POST(request:Request){
  const result=await submitReportRequest(request,{
    siteUrl:process.env.NEXT_PUBLIC_SITE_URL,
    authenticate:async()=>{
      const supabase=await createSupabaseServerClient();
      const {data:{user}}=await supabase.auth.getUser();
      if(!user)return {user:null,accountState:null};
      const {data:profile,error:profileError}=await supabase.from("profiles").select("account_state").eq("id",user.id).maybeSingle();
      return {user:{id:user.id},accountState:profile?.account_state??null,profileError};
    },
    verifyTurnstile,
    createReport:async(input)=>{
      const serviceClient=createSupabaseServiceClient();
      return serviceClient.rpc("create_my_user_report",input);
    },
  });
  return Response.json(result.body,{status:result.status,headers:result.headers});
}
