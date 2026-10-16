export type PublicStructuredDataLocale="zh-CN"|"en"|"ms";

export function serializePublicCreativeWork(input:{
  canonical:string;
  headline:string;
  description:string;
  locale:PublicStructuredDataLocale;
}):string|null;
