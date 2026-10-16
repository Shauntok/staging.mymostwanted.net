export const sitemapPostsPerShard=500;
export const sitemapTagsPerShard=500;

function countShards(count,perShard){
  return Number.isSafeInteger(count)&&count>=0?Math.ceil(count/perShard):null;
}

export function getSitemapShardCount(postCount,tagCount){
  const postShards=countShards(postCount,sitemapPostsPerShard);
  const tagShards=countShards(tagCount,sitemapTagsPerShard);
  if(postShards===null||tagShards===null)return null;
  return Math.max(1,postShards,tagShards);
}

export function getSitemapShardIds(postCount,tagCount){
  const count=getSitemapShardCount(postCount,tagCount);
  return count===null?null:Array.from({length:count},(_,id)=>({id}));
}

export function getSitemapShardRange(id){
  if(!Number.isSafeInteger(id)||id<0)return null;
  const postOffset=id*sitemapPostsPerShard;
  const tagOffset=id*sitemapTagsPerShard;
  if(!Number.isSafeInteger(postOffset)||!Number.isSafeInteger(tagOffset))return null;
  return {postOffset,postLimit:sitemapPostsPerShard,tagOffset,tagLimit:sitemapTagsPerShard};
}
