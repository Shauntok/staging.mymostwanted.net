export type PublicClarificationStructuredDataLocale="zh-CN"|"en"|"ms";

export function serializePublicClarificationArticle(input:{
  canonical?:string|null;
  headline:string;
  description:string;
  datePublished?:string|null;
  locale:PublicClarificationStructuredDataLocale;
  citation?:string|null;
}):string|null;
