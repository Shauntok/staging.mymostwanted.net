const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Parse one public-view page without converting query or projection errors into an empty page. */
export function parsePublicSitemapRecords(data,error){
  if(error||!Array.isArray(data))return null;
  const records=[];
  for(const row of data){
    if(typeof row?.post_id!=="string"||!uuidPattern.test(row.post_id)||typeof row.last_listed_at!=="string"
      ||!Number.isFinite(Date.parse(row.last_listed_at))||(row.content_type!=="story"&&row.content_type!=="clarification"))return null;
    records.push({post_id:row.post_id.toLowerCase(),last_listed_at:row.last_listed_at,content_type:row.content_type});
  }
  return records;
}
