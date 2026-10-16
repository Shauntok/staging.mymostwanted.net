/** @param {string} hostname */
export function isPublicShareHostname(hostname){
  const host=hostname.replace(/^\[|\]$/g,"").toLowerCase();
  if(host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".test"))return false;
  if(host.includes(":")&&(host==="::1"||host==="::"||host.startsWith("fc")||host.startsWith("fd")||host.startsWith("fe80:")||host.startsWith("2001:db8:")))return false;
  const octets=host.split(".").map(Number);
  if(octets.length===4&&octets.every(value=>Number.isInteger(value)&&value>=0&&value<=255)){
    const [first,second]=octets;
    if(first===0||first===10||first===127||first>=224||(first===169&&second===254)||(first===172&&second>=16&&second<=31)||(first===192&&second===168)||(first===100&&second>=64&&second<=127)||(first===198&&(second===18||second===19)))return false;
  }
  return true;
}

/** @param {string} value */
export function isPublicHttpsOrigin(value){
  try{
    const url=new URL(value);
    return url.protocol==="https:"&&!url.username&&!url.password&&url.pathname==="/"&&!url.search&&!url.hash&&isPublicShareHostname(url.hostname);
  }catch{return false;}
}

/**
 * Build outbound share links only from canonical public HTTPS post URLs.
 * The Snapchat Share Sheet uses its documented `link` parameter; the other
 * targets retain the existing platform intent formats. No attribution IDs or
 * campaign query parameters are added.
 * @param {string} value
 * @param {string} text
 * @returns {{id:"whatsapp"|"telegram"|"facebook"|"x"|"snapchat",href:string}[]}
 */
export function buildPublicShareTargets(value,text){
  try{
    const page=new URL(value);
    if(page.protocol!=="https:"||!isPublicShareHostname(page.hostname)||page.username||page.password||page.search||page.hash)return [];
    const url=page.toString();
    const query=new URLSearchParams({url,text:text.slice(0,1200)});
    return [
      {id:"whatsapp",href:`https://wa.me/?${query.toString()}`},
      {id:"telegram",href:`https://t.me/share/url?${query.toString()}`},
      {id:"facebook",href:`https://www.facebook.com/sharer/sharer.php?${new URLSearchParams({u:url}).toString()}`},
      {id:"x",href:`https://twitter.com/intent/tweet?${query.toString()}`},
      {id:"snapchat",href:`https://www.snapchat.com/share?${new URLSearchParams({link:url}).toString()}`},
    ];
  }catch{return [];}
}
