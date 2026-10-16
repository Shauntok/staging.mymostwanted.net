const allowedHosts={
  facebook:["facebook.com","fb.com"],
  instagram:["instagram.com"],
  tiktok:["tiktok.com"],
  telegram:["t.me","telegram.me"],
};

/** Keep client checks aligned with private.is_valid_public_social_url. */
export function isAllowedSubmissionSocialUrl(platform,value){
  if(typeof platform!=="string"||typeof value!=="string"||value.length===0||value.length>1000||[...value].length>500||value!==value.trim()||/[\s\u0000-\u001f\u007f]/.test(value))return false;
  if(!Object.hasOwn(allowedHosts,platform))return false;
  const match=/^https:\/\/([^/:?#]+)(\/[^?#]*)?$/.exec(value.toLowerCase());
  if(!match)return false;
  const host=match[1];
  if(host.length>253||!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/.test(host))return false;
  return allowedHosts[platform].some(domain=>host===domain||host.endsWith(`.${domain}`));
}
