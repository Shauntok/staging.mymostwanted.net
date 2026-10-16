const UTC_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION = Object.freeze({daily: 7, weekly: 4, monthly: 6});

function getLocalDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({type, value}) => [type, value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error("Could not determine the backup calendar date.");
  }
  return {year, month, day};
}

function getPeriodKeys(date, timeZone) {
  const {year, month, day} = getLocalDateParts(date, timeZone);
  const localDateAtUtcMidnight = Date.UTC(year, month - 1, day);
  const weekday = new Date(localDateAtUtcMidnight).getUTCDay() || 7;
  const monday = new Date(localDateAtUtcMidnight - (weekday - 1) * UTC_DAY_MS);
  const dateKey = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  const weekKey = monday.toISOString().slice(0, 10);
  const monthKey = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}`;
  return {daily: dateKey, weekly: weekKey, monthly: monthKey};
}

function compareNewestFirst(left, right) {
  const timeOrder = right.completedAt.getTime() - left.completedAt.getTime();
  return timeOrder || String(left.id).localeCompare(String(right.id));
}

function validateOptions({timeZone, retention = DEFAULT_RETENTION, now = new Date()}) {
  if (typeof timeZone !== "string" || !timeZone.trim()) {
    throw new Error("An explicit IANA time zone is required for backup retention.");
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("Retention planning requires a valid reference time.");
  }
  try {
    new Intl.DateTimeFormat("en", {timeZone}).format(now);
  } catch {
    throw new Error("Backup retention time zone is not a valid IANA time zone.");
  }
  for (const [period, defaultCount] of Object.entries(DEFAULT_RETENTION)) {
    const count = retention?.[period] ?? defaultCount;
    if (!Number.isSafeInteger(count) || count < 1 || count > 366) {
      throw new Error(`Backup ${period} retention count must be an integer from 1 to 366.`);
    }
  }
}

/**
 * Returns a dry-run retention plan. Only complete, integrity-verified full
 * backups participate. This function never deletes or mutates a backup.
 */
export function planBackupRetention(runs, {timeZone, retention = DEFAULT_RETENTION, now = new Date()}) {
  validateOptions({timeZone, retention, now});
  if (!Array.isArray(runs)) throw new Error("Backup runs must be provided as an array.");

  const eligible = [];
  for (const run of runs) {
    if (!run || run.status !== "succeeded" || run.integrityVerified !== true || run.kind !== "full_backup") {
      continue;
    }
    const completedAt = run.completedAt instanceof Date ? run.completedAt : new Date(run.completedAt);
    if (!run.id || !Number.isFinite(completedAt.getTime()) || completedAt.getTime() > now.getTime()) {
      throw new Error("A successful backup run has invalid identity or completion time.");
    }
    eligible.push({...run, completedAt});
  }

  const keepIds = new Set();
  const keptBy = new Map();
  const normalizedRetention = {...DEFAULT_RETENTION, ...retention};

  for (const period of ["daily", "weekly", "monthly"]) {
    const newestPerBucket = new Map();
    for (const run of eligible) {
      const bucket = getPeriodKeys(run.completedAt, timeZone)[period];
      const existing = newestPerBucket.get(bucket);
      if (!existing || compareNewestFirst(run, existing) < 0) newestPerBucket.set(bucket, run);
    }

    const selected = [...newestPerBucket.entries()]
      .sort(([left], [right]) => right.localeCompare(left))
      .slice(0, normalizedRetention[period]);

    for (const [bucket, run] of selected) {
      keepIds.add(run.id);
      const reasons = keptBy.get(run.id) ?? [];
      reasons.push({period, bucket});
      keptBy.set(run.id, reasons);
    }
  }

  const candidates = eligible
    .filter((run) => !keepIds.has(run.id))
    .sort(compareNewestFirst)
    .map(({id, completedAt}) => ({id, completedAt: completedAt.toISOString()}));

  return {
    generatedAt: now.toISOString(),
    timeZone,
    retention: normalizedRetention,
    keep: [...keptBy.entries()].map(([id, reasons]) => ({id, reasons})),
    deleteCandidates: candidates,
    untouched: runs.length - eligible.length,
  };
}
