const languageTags={"zh-CN":"zh-CN",en:"en-MY",ms:"ms-MY"};

function safeCanonical(value){
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

/** Serialize only the visible public summary, never the registration-gated body or internal fields. */
export function serializePublicCreativeWork({canonical,headline,description,locale}){
  const url=safeCanonical(canonical);
  const safeHeadline=safeText(headline,90);
  const safeDescription=safeText(description,180);
  const inLanguage=languageTags[locale];
  if(!url||!safeHeadline||!safeDescription||!inLanguage)return null;
  return JSON.stringify({
    "@context":"https://schema.org",
    "@type":"CreativeWork",
    headline:safeHeadline,
    description:safeDescription,
    inLanguage,
    mainEntityOfPage:url,
  }).replace(/</g,"\\u003c");
}
