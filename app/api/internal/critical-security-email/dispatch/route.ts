import {createSupabaseServiceClient} from "@/lib/supabase/service";
import {isPermanentCriticalSecurityEmailRejection,sendCriticalSecurityEmail} from "@/lib/email/critical-security";
import {isCriticalSecurityEmailEnabled,isCriticalSecurityEmailRequest} from "@/lib/security/critical-security-email-auth";

export const runtime="nodejs";
export const dynamic="force-dynamic";

type AlertType="brute_force_attack"|"backup_failure"|"backup_validation_failure"|"production_security_incident";
const alertTypes=new Set<AlertType>(["brute_force_attack","backup_failure","backup_validation_failure","production_security_incident"]);
const noStore={"Cache-Control":"no-store"};

export async function POST(request:Request){
  if(!isCriticalSecurityEmailEnabled())return Response.json({error:"Email dispatcher unavailable."},{status:503,headers:noStore});
  if(!isCriticalSecurityEmailRequest(request))return Response.json({error:"Unauthorized."},{status:401,headers:noStore});
  try{
    const supabase=createSupabaseServiceClient();
    let sent=0;
    for(let attempt=0;attempt<10;attempt+=1){
      const {data,error}=await supabase.rpc("mmwr_claim_critical_security_email");
      if(error)throw error;
      const row=Array.isArray(data)?data[0]:null;
      if(!row)break;
      const item=row as Record<string,unknown>;
      if(typeof item.delivery_id!=="string"||typeof item.lease_token!=="string"||typeof item.alert_type!=="string"
        ||!alertTypes.has(item.alert_type as AlertType)||typeof item.created_at!=="string"||typeof item.recipient_email!=="string"){
        throw new Error("Email queue response is invalid.");
      }
      let mailError:unknown=null;
      try{await sendCriticalSecurityEmail(item.recipient_email,item.alert_type as AlertType,item.created_at);}
      catch(error){mailError=error;}
      const permanent=mailError!==null&&isPermanentCriticalSecurityEmailRejection(mailError);
      const {data:finished,error:finishError}=await supabase.rpc("mmwr_finish_critical_security_email",{
        p_delivery_id:item.delivery_id,p_lease_token:item.lease_token,
        p_outcome:mailError===null?"sent":permanent?"failed":"retry",
        p_error_code:mailError===null?null:permanent?"smtp_rejected":"delivery_uncertain",
      });
      if(finishError||finished!==true)throw finishError??new Error("Email delivery lease expired.");
      if(mailError===null)sent+=1;
    }
    return Response.json({processed:sent},{headers:noStore});
  }catch{
    return Response.json({error:"Email dispatcher unavailable."},{status:503,headers:noStore});
  }
}
