export type IndexableSitemapRecord={post_id:string;last_listed_at:string;content_type:"story"|"clarification"};
export function parsePublicSitemapRecords(data:unknown,error:unknown):IndexableSitemapRecord[]|null;
