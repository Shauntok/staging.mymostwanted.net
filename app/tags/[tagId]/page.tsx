import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {TagPostsPage} from "@/components/tags/TagPostsPage";
import {getPublicTagPosts} from "@/lib/public-posts";
import {getLocalizedPageMetadata} from "@/lib/seo/localized-page-metadata";

const metadataCopy={
  "zh-CN":{title:"标签公开内容",description:"浏览与此标签相关的已审核公开内容。"},
  en:{title:"Public tag posts",description:"Browse reviewed public posts associated with this tag."},
  ms:{title:"Hantaran awam mengikut tag",description:"Lihat hantaran awam yang telah disemak untuk tag ini."},
} satisfies Parameters<typeof getLocalizedPageMetadata>[1];
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function generateMetadata({params,searchParams}:{params:Promise<{tagId:string}>;searchParams:Promise<{page?:string|string[]}>}):Promise<Metadata>{
  const [{tagId},queryParams]=await Promise.all([params,searchParams]);
  const id=uuidPattern.test(tagId)?tagId.toLowerCase():"invalid";
  const rawPage=Array.isArray(queryParams.page)?queryParams.page[0]:queryParams.page;
  const parsed=rawPage&&/^\d{1,6}$/.test(rawPage)?Number(rawPage):1;
  const page=Number.isSafeInteger(parsed)&&parsed>1?parsed:1;
  const result=page===1&&id!=="invalid"?await getPublicTagPosts(id,1,1):null;
  const tagLabel=result?.tagLabel?.trim()??"";
  const validLabel=tagLabel.length>0&&tagLabel.length<=80&&!/[\u0000-\u001f\u007f]/.test(tagLabel);
  const localizedCopy=validLabel?Object.fromEntries(Object.entries(metadataCopy).map(([locale,copy])=>[locale,{
    title:`${tagLabel} — ${copy.title}`,
    description:`${copy.description} “${tagLabel}”.`,
  }])) as typeof metadataCopy:metadataCopy;
  const hasPublicPosts=result?.status==="ready"&&result.posts.length>0&&validLabel;
  return getLocalizedPageMetadata(`/tags/${id}${page>1?`?page=${page}`:""}`,localizedCopy,page===1&&Boolean(hasPublicPosts));
}

export default async function TagPostsRoute({params,searchParams}:{params:Promise<{tagId:string}>;searchParams:Promise<{page?:string|string[]}>}){
  const [{tagId},query]=await Promise.all([params,searchParams]);
  if(!uuidPattern.test(tagId))notFound();
  const rawPage=Array.isArray(query.page)?query.page[0]:query.page;
  const parsed=rawPage&&/^\d{1,6}$/.test(rawPage)?Number(rawPage):1;
  const page=Number.isSafeInteger(parsed)&&parsed>0?parsed:1;
  const result=await getPublicTagPosts(tagId,page,12);
  if(result.status==="empty"&&result.tagLabel===null)notFound();
  return <TagPostsPage tagLabel={result.tagLabel} posts={result.posts} status={result.status} page={page} hasNextPage={result.hasNextPage} basePath={`/tags/${tagId.toLowerCase()}`}/>;
}
