import {isIP} from "node:net";

const nonPublicHostSuffixes=["localhost","local","localdomain","internal","lan","test","invalid","example","example.com","example.net","example.org","home.arpa","arpa","onion"];

/**
 * Return a safe HTTPS site origin for a manually initiated Telegram share.
 * @param {string} value
 * @returns {string|null}
 */
export function publicShareSiteOrigin(value){
  try{
    const site=new URL(value);
    const hostname=site.hostname.toLowerCase().replace(/\.$/,"");
    const ipHost=hostname.replace(/^\[|\]$/g,"");
    const nonPublicHost=nonPublicHostSuffixes.some(suffix=>hostname===suffix||hostname.endsWith(`.${suffix}`));
    if(site.protocol!=="https:"||site.username||site.password||isIP(ipHost)!==0||!hostname.includes(".")||nonPublicHost)return null;
    site.hostname=hostname;
    site.pathname="/";site.search="";site.hash="";
    return site.toString();
  }catch{return null;}
}
