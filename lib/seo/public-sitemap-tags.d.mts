type CountRpcClient={
  rpc(name:"public_sitemap_tag_ids",args:Record<string,never>,options:{count:"exact";head:true}):PromiseLike<{count:number|null;error:unknown}>;
};
type PageRpcClient={
  rpc(name:"public_sitemap_tag_ids",args:Record<string,never>):{
    range(from:number,to:number):PromiseLike<{data:unknown[]|null;error:unknown}>;
  };
};

export function countPublicSitemapTagIds(supabase:CountRpcClient):Promise<number|null>;
export function listPublicSitemapTagIds(supabase:PageRpcClient,offset:number,limit:number):Promise<{tag_id:string}[]|null>;
