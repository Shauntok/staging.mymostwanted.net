function escapeXml(value){
  return String(value).replace(/[&<>"']/g,(character)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[character]));
}

function toAbsoluteHttpUrl(value){
  try{
    const url=new URL(value);
    return url.protocol==="https:"||url.protocol==="http:"?url.toString():null;
  }catch{return null;}
}

export function parseSitemapShardId(value){
  if(typeof value!=="string"||! /^(0|[1-9]\d*)$/.test(value))return null;
  const id=Number(value);
  return Number.isSafeInteger(id)?id:null;
}

export function buildSitemapIndexXml(origin,shards){
  if(!(origin instanceof URL)||!Array.isArray(shards))throw new TypeError("Sitemap index input is invalid.");
  const locs=shards.flatMap(({id})=>Number.isSafeInteger(id)&&id>=0
    ?[`<sitemap><loc>${escapeXml(new URL(`/sitemap/${id}`,origin).toString())}</loc></sitemap>`]
    :[]);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs.join("")}</sitemapindex>`;
}

export function buildSitemapXml(entries){
  if(!Array.isArray(entries))throw new TypeError("Sitemap entries are invalid.");
  const urls=entries.flatMap((entry)=>{
    const loc=toAbsoluteHttpUrl(entry?.url);
    if(!loc)return [];
    const lastModified=entry.lastModified instanceof Date?entry.lastModified.toISOString():entry.lastModified;
    const lastmod=typeof lastModified==="string"&&Number.isFinite(Date.parse(lastModified))
      ?`<lastmod>${escapeXml(new Date(lastModified).toISOString())}</lastmod>`:"";
    const languages=entry.alternates?.languages&&typeof entry.alternates.languages==="object"
      ?Object.entries(entry.alternates.languages).flatMap(([language,href])=>{
          const absolute=toAbsoluteHttpUrl(href);
          return /^[A-Za-z0-9-]{2,35}$/.test(language)&&absolute
            ?[`<xhtml:link rel="alternate" hreflang="${escapeXml(language)}" href="${escapeXml(absolute)}"/>`]
            :[];
        }).join("")
      :"";
    return [`<url><loc>${escapeXml(loc)}</loc>${lastmod}${languages}</url>`];
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join("")}</urlset>`;
}
