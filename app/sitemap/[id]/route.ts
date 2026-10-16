import {getPublicSitemapShardDocument} from "@/lib/seo/public-sitemap";
import {parseSitemapShardId} from "@/lib/seo/sitemap-document.mjs";

export const dynamic="force-dynamic";

export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
  const {id:rawId}=await context.params;
  const id=parseSitemapShardId(rawId);
  if(id===null)return new Response("Not found",{status:404,headers:{"Cache-Control":"no-store"}});
  const document=await getPublicSitemapShardDocument(id);
  if(!document)return new Response("Not found",{status:404,headers:{"Cache-Control":"no-store"}});
  return new Response(document,{headers:{"Cache-Control":"public, max-age=0, must-revalidate","Content-Type":"application/xml; charset=utf-8"}});
}
