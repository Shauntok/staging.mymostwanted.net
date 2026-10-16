import "server-only";
import type {Locale} from "@/lib/i18n/catalog";

export type TelegramSupportConfig={available:false}|{available:true;baseUrl:string};

export function getTelegramSupportConfig(raw:string|undefined):TelegramSupportConfig{
  if(!raw||raw!==raw.trim()||raw.length>100)return {available:false};
  try{
    const url=new URL(raw);
    if(url.protocol!=="https:"||url.hostname.toLowerCase()!=="t.me"||url.username||url.password||url.port||url.search||url.hash||!/^\/[A-Za-z][A-Za-z0-9_]{4,31}$/.test(url.pathname))return {available:false};
    return {available:true,baseUrl:`https://t.me/${url.pathname.slice(1)}`};
  }catch{return {available:false};}
}

export function buildClarificationTelegramUrl(input:{baseUrl:string;locale:Locale;sonTitle:string;caseId:string;canonicalSonUrl:string;explanation:string}):string{
  const support=getTelegramSupportConfig(input.baseUrl);
  if(!support.available||!/^[0-9a-f-]{36}$/i.test(input.caseId))return "";
  let canonical:URL;
  try{canonical=new URL(input.canonicalSonUrl);if(canonical.protocol!=="https:"||canonical.username||canonical.password)return "";}catch{return "";}
  const subject=input.sonTitle.trim().replace(/[\r\n\u0000-\u001f]/g," ").slice(0,200);
  const explanation=input.explanation.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,"").slice(0,2000);
  const lead=input.locale==="zh-CN"?"澄清请求":input.locale==="ms"?"Permintaan penjelasan":"Clarification request";
  const description=input.locale==="zh-CN"?"请说明希望澄清的内容：":input.locale==="ms"?"Sila nyatakan perkara yang ingin dijelaskan:":"Please explain what you would like clarified:";
  const text=[lead,`Case ID: ${input.caseId}`,`Post: ${subject}`,`URL: ${canonical.toString()}`,"",description,explanation].join("\n");
  const result=new URL(support.baseUrl);result.searchParams.set("text",text);return result.toString();
}
