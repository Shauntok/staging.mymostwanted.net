import {publicShareSiteOrigin} from "./share-origin.mjs";
import {parseReportRequestEnvelope} from "./request-envelope.mjs";

const responseHeaders={"Cache-Control":"no-store, max-age=0","X-Content-Type-Options":"nosniff","X-Robots-Tag":"noindex, nofollow, noarchive"};
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reportReasons=new Set(["inaccurate_information","privacy","safety","spam","other"]);
const feedbackReasons=new Set(["suggestion","accessibility","technical_issue","other"]);
const telegramDraftText={
  "zh-CN":(reference)=>`MMWR 举报／反馈参考编号：${reference}\n请协助查看这条在 MMWR 提交的事项。`,
  en:(reference)=>`MMWR report/feedback reference: ${reference}\nPlease review this item submitted on MMWR.`,
  ms:(reference)=>`Rujukan laporan/maklum balas MMWR: ${reference}\nSila semak perkara yang dihantar melalui MMWR ini.`,
};

function result(status,body){
  return {status,body,headers:responseHeaders};
}

/**
 * @param {Request} request
 * @param {import("./submit.d.mts").SubmitReportDependencies} dependencies
 */
export async function submitReportRequest(request,dependencies){
  const envelope=await parseReportRequestEnvelope(request);
  if(!envelope.ok)return result(envelope.status,{error:"invalid_request"});
  if(!envelope.body||typeof envelope.body!=="object")return result(400,{error:"invalid_request"});

  const input=envelope.body;
  const kind=input.kind;
  const locale=input.locale==="zh-CN"||input.locale==="ms"?input.locale:"en";
  const postId=input.postId===null?null:typeof input.postId==="string"?input.postId:null;
  const reason=typeof input.reason==="string"?input.reason:"";
  const message=typeof input.message==="string"?input.message.trim():"";
  const turnstileToken=typeof input.turnstileToken==="string"?input.turnstileToken:"";
  const reasonValid=kind==="report"?reportReasons.has(reason):kind==="feedback"?feedbackReasons.has(reason):false;
  if((kind!=="report"&&kind!=="feedback")||!reasonValid||message.length<1||message.length>2000||turnstileToken.length<1||turnstileToken.length>2048||(kind==="report"&&(!postId||!uuidPattern.test(postId)))||(kind==="feedback"&&postId!==null))return result(400,{error:"invalid_request"});

  try{
    const identity=await dependencies.authenticate();
    if(!identity.user)return result(401,{error:"sign_in_required"});
    if(identity.profileError||identity.accountState!=="active")return result(403,{error:"account_restricted"});

    if(!dependencies.siteUrl)return result(503,{error:"captcha_unavailable"});
    const verification=await dependencies.verifyTurnstile(turnstileToken,"mmwr_report");
    if(verification==="unavailable")return result(503,{error:"captcha_unavailable"});
    if(verification==="invalid")return result(400,{error:"captcha_invalid"});

    const {data,error}=await dependencies.createReport({
      p_submitter_id:identity.user.id,
      p_kind:kind,
      p_post_id:postId,
      p_reason:reason,
      p_message:message,
    });
    if(error?.code==="P0001"&&error.message==="report_rate_limited")return result(429,{error:"rate_limited"});
    if(error)return result(503,{error:"submission_unavailable"});
    if(typeof data!=="string")return result(409,{error:"submission_unavailable"});

    const telegramText=telegramDraftText[locale](data);
    const shareableSite=publicShareSiteOrigin(dependencies.siteUrl);
    let telegramUrl=null;
    if(shareableSite){
      const share=new URL("https://t.me/share/url");
      share.searchParams.set("url",shareableSite);
      share.searchParams.set("text",telegramText);
      telegramUrl=share.toString();
    }
    return result(200,{reference:data,telegramUrl,telegramText});
  }catch{
    return result(503,{error:"submission_unavailable"});
  }
}
