/** Treat genuine empty public results as valid and missing/error results as unavailable. */
export function isSitemapPublicQueryAvailable(result){
  return result!==null&&typeof result==="object"&&(result.status==="ready"||result.status==="empty");
}

/** Child-area enumeration is complete only when every requested parent query succeeded. */
export function areSitemapChildAreaResultsAvailable(results){
  return Array.isArray(results)&&results.every(result=>result?.status==="ready");
}
