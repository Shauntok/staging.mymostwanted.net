export function parseSitemapShardId(value:string):number|null;
export function buildSitemapIndexXml(origin:URL,shards:{id:number}[]):string;
export function buildSitemapXml(entries:Array<{
  url:string;
  lastModified?:Date|string;
  alternates?:{languages?:Record<string,string>};
}>):string;
