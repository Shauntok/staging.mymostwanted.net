import type {MetadataRoute} from "next";
import {getIndexableProductionOrigin} from "@/lib/seo/indexable-origin";

export const dynamic="force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin=getIndexableProductionOrigin();
  const allowIndexing=Boolean(origin);
  const privatePaths=["/account","/admin","/api","/auth","/submissions","/submit"];
  const disallowedPaths=[...privatePaths,...["/en","/zh-cn","/ms"].flatMap(locale=>privatePaths.map(path=>`${locale}${path}`))];

  return {
    rules: {
      userAgent: "*",
      allow: allowIndexing ? "/" : undefined,
      disallow: allowIndexing ? disallowedPaths : "/",
    },
    sitemap: origin?new URL("/sitemap.xml",origin).toString():undefined,
  };
}
