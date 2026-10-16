import type { Metadata } from "next";
import {TagDirectory} from "@/components/tags/TagDirectory";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {getLocalizedPageMetadata} from "@/lib/seo/localized-page-metadata";

const metadataCopy={
  "zh-CN":{title:"浏览标签",description:"探索已审核并公开的 MMWR 帖子标签。"},
  en:{title:"Explore tags",description:"Explore tags from reviewed and published MMWR posts."},
  ms:{title:"Terokai tag",description:"Terokai tag daripada hantaran MMWR yang telah disemak dan diterbitkan."},
} satisfies Parameters<typeof getLocalizedPageMetadata>[1];

type DirectoryTag = {tag_id:string;tag_label:string;public_post_count:number};

async function getTagDirectory() {
  try {
    const supabase = await createSupabaseServerClient();
    const {data,error} = await supabase.rpc("public_tag_directory");
    if (error || !data) return {tags: [], status: "unavailable" as const};
    return {tags: (data as DirectoryTag[]).map(tag=>({...tag,public_post_count:Number(tag.public_post_count)})), status: data.length ? "ready" as const : "empty" as const};
  } catch {
    return {tags: [], status: "unavailable" as const};
  }
}

export async function generateMetadata({searchParams}:{searchParams:Promise<{preview?:string|string[]}>}):Promise<Metadata>{
  const [query,directory]=await Promise.all([searchParams,getTagDirectory()]);
  const preview=typeof query.preview==="string"&&query.preview.length>0;
  return getLocalizedPageMetadata("/tags",metadataCopy,!preview&&directory.status==="ready"&&directory.tags.length>0);
}

export default async function TagsPage() {
  const directory = await getTagDirectory();
  return <TagDirectory tags={directory.tags} status={directory.status}/>;
}
