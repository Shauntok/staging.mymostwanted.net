const DEFAULT_MAX_STORAGE_OBJECT_BYTES = 10 * 1024 * 1024;
const MAX_CONFIGURED_STORAGE_OBJECT_BYTES = 1024 * 1024 * 1024;

/** Keep one downloaded object bounded even when Storage omits Content-Length. */
export function getMaxStorageObjectBytes(value = process.env.MMWR_BACKUP_MAX_STORAGE_OBJECT_BYTES) {
  if (value === undefined || value === "") return DEFAULT_MAX_STORAGE_OBJECT_BYTES;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new Error("Backup Storage object byte limit is invalid.");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > MAX_CONFIGURED_STORAGE_OBJECT_BYTES) {
    throw new Error("Backup Storage object byte limit is outside the supported range.");
  }
  return parsed;
}

export function getMaxTotalStorageBytes(value = process.env.MMWR_BACKUP_MAX_TOTAL_STORAGE_BYTES) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new Error("Backup total Storage byte budget must be configured as a positive integer.");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error("Backup total Storage byte budget is outside the supported range.");
  }
  return parsed;
}
