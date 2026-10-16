const MAX_VISIBLE_THUMBNAILS=3;

export function buildPublicThumbnailGridLayout(thumbnailCount,failedPositions=[]){
  const count=Number.isSafeInteger(thumbnailCount)&&thumbnailCount>0?thumbnailCount:0;
  const visibleCount=Math.min(count,MAX_VISIBLE_THUMBNAILS);
  const failed=new Set(Array.isArray(failedPositions)?failedPositions.filter(position=>Number.isSafeInteger(position)&&position>=0&&position<visibleCount):[]);
  if(failed.size>0)return {slots:[],moreCount:0};
  const slots=Array.from({length:visibleCount},(_,position)=>({position}));
  return {slots,moreCount:Math.max(0,count-visibleCount)};
}
