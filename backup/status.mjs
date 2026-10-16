const PHASES = new Set([
  "database_export",
  "storage_backup",
  "manifest_verification",
  "complete",
  "failed",
]);

function requireCount(value, name, maximum) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new Error(`Backup status ${name} is invalid.`);
  }
}

/**
 * Creates the narrow persistence callback for the service-only backup RPC.
 * The injected client must use a server-side service credential; callers must
 * never pass this callback or client into a browser bundle.
 */
export function createBackupStatusWriter({client, triggerKind, requestedBy = null}) {
  if (!client || typeof client.rpc !== "function") {
    throw new Error("A server-side Supabase RPC client is required for backup status.");
  }
  if (!(["scheduled", "owner_manual"].includes(triggerKind))
    || (triggerKind === "scheduled" && requestedBy !== null)
    || (triggerKind === "owner_manual"
      && (typeof requestedBy !== "string"
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedBy)))) {
    throw new Error("Backup status trigger metadata is invalid.");
  }

  return async function persistBackupStatus(event) {
    if (!event || !/^[A-Za-z0-9_-]{1,80}$/.test(event.runId)
      || !["running", "succeeded", "failed"].includes(event.status)
      || !PHASES.has(event.phase)) {
      throw new Error("Backup status event is invalid.");
    }
    requireCount(event.artifactCount, "artifact count", 100001);
    requireCount(event.encryptedBytes, "encrypted byte count", Number.MAX_SAFE_INTEGER);

    const {error} = await client.rpc("mmwr_record_backup_run", {
      p_run_id: event.runId,
      p_trigger_kind: triggerKind,
      p_requested_by: requestedBy,
      p_status: event.status,
      p_phase: event.phase,
      p_integrity_verified: event.integrityVerified === true,
      p_artifact_count: event.artifactCount,
      p_encrypted_bytes: event.encryptedBytes,
      p_manifest_object_key: event.manifestObjectKey ?? null,
      p_failure_code: event.failureCode ?? null,
    });
    if (error) throw new Error("Backup run status could not be persisted.");
  };
}
