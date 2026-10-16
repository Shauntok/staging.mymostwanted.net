export type StaffStorageUsageSummary={
  evidenceObjectCount:number;
  evidenceTotalBytes:number;
  thumbnailObjectCount:number;
  thumbnailTotalBytes:number;
};

export function parseStaffStorageUsage(value:unknown):StaffStorageUsageSummary|null;
