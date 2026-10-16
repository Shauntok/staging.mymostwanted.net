const languageTags={"zh-CN":"zh-CN",en:"en-MY",ms:"ms-MY"};
const isoDateTimePattern=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function safeUrl(value){
  if(typeof value!=="string"||value.length>2048)return null;
  try{
    const url=new URL(value);
    if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash)return null;
    return url.toString();
  }catch{return null;}
}

function safeText(value,maxLength){
  if(typeof value!=="string")return null;
  const normalized=value.replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim();
  if(!normalized)return null;
  return normalized.length>maxLength?`${normalized.slice(0,maxLength-1).trimEnd()}…`:normalized;
}

function safePublishedDate(value){
  return typeof value==="string"&&isoDateTimePattern.test(value)&&Number.isFinite(Date.parse(value))?value:null;
}

/** Serialize only a clarification's public summary and accurate, available Article metadata. */
export function serializePublicClarificationArticle({canonical,headline,description,datePublished,locale,citation}){
  const safeHeadline=safeText(headline,90);
  const safeDescription=safeText(description,180);
  const inLanguage=languageTags[locale];
  if(!safeHeadline||!safeDescription||!inLanguage)return null;
  const canonicalUrl=safeUrl(canonical);
  const candidateCitation=safeUrl(citation);
  const citationUrl=canonicalUrl&&candidateCitation&&new URL(canonicalUrl).origin===new URL(candidateCitation).origin?candidateCitation:null;
  const publishedDate=safePublishedDate(datePublished);
  return JSON.stringify({
    "@context":"https://schema.org",
    "@type":"Article",
    headline:safeHeadline,
    description:safeDescription,
    ...(publishedDate?{datePublished:publishedDate}:{}),
    inLanguage,
    ...(canonicalUrl?{mainEntityOfPage:canonicalUrl}:{}),
    ...(citationUrl?{citation:citationUrl}:{}),
  }).replace(/</g,"\\u003c");
}
