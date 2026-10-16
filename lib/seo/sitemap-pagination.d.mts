export const sitemapPostsPerShard:500;
export const sitemapTagsPerShard:500;
export function getSitemapShardCount(postCount:number|null,tagCount:number|null):number|null;
export function getSitemapShardIds(postCount:number|null,tagCount:number|null):{id:number}[]|null;
export function getSitemapShardRange(id:number):{
  postOffset:number;
  postLimit:500;
  tagOffset:number;
  tagLimit:500;
}|null;
