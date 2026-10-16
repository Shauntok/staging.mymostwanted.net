function toSafeNonNegativeInteger(value){
  if(typeof value!=="number"&&typeof value!=="string")return null;
  if(typeof value==="string"&&!/^\d+$/.test(value))return null;
  const parsed=Number(value);
  return Number.isSafeInteger(parsed)&&parsed>=0?parsed:null;
}

export function parseStaffStorageUsage(value){
  const row=Array.isArray(value)?value[0]:value;
  if(!row||typeof row!=="object")return null;
  const record=row;
  const evidenceObjectCount=toSafeNonNegativeInteger(record.evidence_object_count);
  const evidenceTotalBytes=toSafeNonNegativeInteger(record.evidence_total_bytes);
  const thumbnailObjectCount=toSafeNonNegativeInteger(record.thumbnail_object_count);
  const thumbnailTotalBytes=toSafeNonNegativeInteger(record.thumbnail_total_bytes);
  if(evidenceObjectCount===null||evidenceTotalBytes===null||thumbnailObjectCount===null||thumbnailTotalBytes===null)return null;
  return {evidenceObjectCount,evidenceTotalBytes,thumbnailObjectCount,thumbnailTotalBytes};
}
