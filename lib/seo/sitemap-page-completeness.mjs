/** Ensure a fetched public sitemap page contains the number of rows implied by its count and offset. */
export function isCompleteSitemapPage(items,totalCount,offset,limit){
  if(!Array.isArray(items)||!Number.isSafeInteger(totalCount)||totalCount<0||!Number.isSafeInteger(offset)||offset<0
    ||!Number.isSafeInteger(limit)||limit<1||!Number.isSafeInteger(offset+limit))return false;
  return items.length===Math.min(limit,Math.max(0,totalCount-offset));
}
