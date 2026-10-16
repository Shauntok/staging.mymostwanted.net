import {getPublicSitemapIndexDocument} from "@/lib/seo/public-sitemap";

export const dynamic="force-dynamic";

export async function GET(){
  const document=await getPublicSitemapIndexDocument();
  if(!document)return new Response("Not found",{status:404,headers:{"Cache-Control":"no-store"}});
  return new Response(document,{headers:{"Cache-Control":"public, max-age=0, must-revalidate","Content-Type":"application/xml; charset=utf-8"}});
}
