import {parseBackupManifest} from "./manifest.mjs";

const DATABASE_RESTORE_ORDER = Object.freeze([
  "database_roles",
  "database_schema",
  "database_auth_schema",
  "database_storage_schema",
  "database_data",
  "database_auth_data",
  "database_storage_data",
  "migration_history",
  "database_platform_compatibility",
]);

function requireProjectRef(value, name) {
  if (typeof value !== "string" || !/^[a-z0-9]{20}$/.test(value)) {
    throw new Error(`Restore ${name} project reference is invalid.`);
  }
  return value;
}

/**
 * Builds an offline restore checklist. It never downloads artifacts, connects
 * to Supabase, invokes psql, or writes to a restore target.
 */
export function createIsolatedRestorePlan({
  manifest,
  expectedRunId,
  sourceProjectRef,
  targetProjectRef,
  targetEnvironment,
}) {
  const sourceRef = requireProjectRef(sourceProjectRef, "source");
  const targetRef = requireProjectRef(targetProjectRef, "target");
  if (sourceRef === targetRef) {
    throw new Error("An isolated restore target must differ from its source project.");
  }
  if (targetEnvironment !== "isolated") {
    throw new Error("Backup restore plans may only target an explicitly isolated environment.");
  }

  const verifiedManifest = parseBackupManifest(manifest, expectedRunId);
  const byKind = new Map();
  for (const artifact of verifiedManifest.artifacts) {
    const items = byKind.get(artifact.kind) ?? [];
    items.push(artifact);
    byKind.set(artifact.kind, items);
  }
  for (const kind of DATABASE_RESTORE_ORDER) {
    if (byKind.get(kind)?.length !== 1) {
      throw new Error(`Restore manifest must contain exactly one ${kind} artifact.`);
    }
  }

  return Object.freeze({
    mode: "offline_plan_only",
    sourceProjectRef: sourceRef,
    targetProjectRef: targetRef,
    targetEnvironment,
    runId: verifiedManifest.runId,
    databaseArtifacts: DATABASE_RESTORE_ORDER.map((kind) => ({
      kind,
      artifactId: byKind.get(kind)[0].artifactId,
      objectKey: byKind.get(kind)[0].objectKey,
      plaintextSha256: byKind.get(kind)[0].plaintextSha256,
      plaintextBytes: byKind.get(kind)[0].plaintextBytes,
    })),
    storageBuckets: verifiedManifest.storageBuckets.map((bucket) => ({...bucket})),
    storageObjects: byKind.get("storage_object")?.map((artifact) => ({
      artifactId: artifact.artifactId,
      objectKey: artifact.objectKey,
      bucket: artifact.sourceBucket,
      path: artifact.sourceObjectPath,
      mimeType: artifact.sourceMimeType ?? null,
      cacheControl: artifact.sourceCacheControl ?? null,
      plaintextSha256: artifact.plaintextSha256,
      plaintextBytes: artifact.plaintextBytes,
    })) ?? [],
    requiredChecks: [
      "restore to the named isolated Supabase project only",
      "decrypt and verify every artifact before applying any writes",
      "verify the PostgreSQL major version and exact Auth and Storage migration ledgers before writes",
      "restore only application-owned Auth and Storage customizations over platform-provisioned schemas",
      "restore database schema, roles, data, and migration history with the Supabase restore procedure",
      "restore Storage bucket policies and object bytes; verify every object reference",
      "verify RLS, grants, staff roles, authentication, and public/private object access",
      "record row counts, object counts, errors, restore duration, and recovery-point age",
    ],
    writesPerformed: false,
  });
}
