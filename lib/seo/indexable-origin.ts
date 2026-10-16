/** Return the configured production origin only when the site's indexing gate is open. */
export function getIndexableProductionOrigin():URL|null{
  if(process.env.VERCEL_ENV!=="production"||process.env.ALLOW_SEARCH_INDEXING!=="true")return null;
  const configured=process.env.NEXT_PUBLIC_SITE_URL;
  if(!configured)return null;
  try{
    const url=new URL(configured);
    if(url.protocol!=="https:"||url.username||url.password||url.pathname!=="/"||url.search||url.hash)return null;
    return new URL(url.origin);
  }catch{
    return null;
  }
}
