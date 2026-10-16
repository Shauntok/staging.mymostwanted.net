const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maxSitemapTagPageSize=500;

/** Count unique public tag IDs without transferring the RPC's complete result set. */
export async function countPublicSitemapTagIds(supabase){
  try{
    const {count,error}=await supabase.rpc("public_sitemap_tag_ids",{}, {count:"exact",head:true});
    return !error&&Number.isSafeInteger(count)&&count>=0?count:null;
  }catch{return null;}
}

/** Read one stable tag-ID range that stays below the configured PostgREST row cap. */
export async function listPublicSitemapTagIds(supabase,offset,limit){
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>maxSitemapTagPageSize
    ||!Number.isSafeInteger(offset+limit-1))return null;
  try{
    const {data,error}=await supabase.rpc("public_sitemap_tag_ids",{}).range(offset,offset+limit-1);
    if(error||!Array.isArray(data)||data.some(row=>typeof row?.tag_id!=="string"||!uuidPattern.test(row.tag_id)))return null;
    const tagIds=data.map(row=>row.tag_id.toLowerCase());
    if(new Set(tagIds).size!==tagIds.length)return null;
    return tagIds.map(tag_id=>({tag_id}));
  }catch{return null;}
}
