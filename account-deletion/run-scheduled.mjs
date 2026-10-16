import {createClient, isAuthApiError} from "@supabase/supabase-js";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

const REQUEST_TIMEOUT_MS = 20_000;

function required(env, key) {
  const value = env[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Account-deletion configuration ${key} is missing.`);
  }
  return value;
}

function fetchWithTimeout(input, init = {}) {
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;
  return fetch(input, {...init, signal});
}

/** One bounded, separately gated cleanup run. It never removes Storage files. */
export async function runScheduledAccountDeletion() {
  const env = process.env;
  if (env.ACCOUNT_DELETION_CLEANUP_ENABLED !== "true") {
    throw new Error("Account-deletion cleanup is disabled by configuration.");
  }

  const client = createClient(
    required(env, "SUPABASE_URL"),
    required(env, "SUPABASE_SECRET_KEY"),
    {
      auth: {autoRefreshToken: false, persistSession: false, detectSessionInUrl: false},
      global: {
        fetch: fetchWithTimeout,
        headers: {"x-application-name": "mmwr-account-deletion-worker"},
      },
    },
  );

  const {data: userIds, error: claimError} = await client.rpc(
    "claim_expired_account_deletions",
    {p_batch_size: 20},
  );
  if (claimError || !Array.isArray(userIds)) {
    throw new Error("Could not claim expired account-deletion requests.");
  }

  let deleted = 0;
  let authOutcomesSentForReview = 0;
  for (const row of userIds) {
    if (!row || typeof row.user_id !== "string") {
      throw new Error("Account-deletion claim returned an invalid row.");
    }

    const {data: attemptStarted, error: attemptError} = await client.rpc(
      "begin_account_deletion_auth_attempt",
      {p_user_id: row.user_id},
    );
    if (attemptError) {
      throw new Error("Could not confirm the account-deletion attempt.");
    }
    if (attemptStarted !== true) {
      continue;
    }

    let reviewReason = null;
    try {
      const {error: deleteError} = await client.auth.admin.deleteUser(row.user_id, false);
      if (deleteError) {
        // The SDK returns transport, timeout and response-decoding errors in
        // {error}, too. Only an explicit provider 4xx refusal is definitive.
        reviewReason = isAuthApiError(deleteError) && deleteError.status >= 400 && deleteError.status < 500
          ? "auth_cleanup_failed"
          : "auth_cleanup_uncertain";
      }
    } catch {
      // A lost response may follow a committed Auth deletion. Keep the attempt
      // at-most-once and label the provider outcome as uncertain for Owner review.
      reviewReason = "auth_cleanup_uncertain";
    }

    if (!reviewReason) {
      deleted += 1;
      continue;
    }

    const {data: reviewMarked, error: reviewError} = await client.rpc(
      "mark_account_deletion_review_required",
      {p_user_id: row.user_id, p_reason: reviewReason},
    );
    if (reviewError || reviewMarked !== true) {
      throw new Error("Account deletion failed and could not be moved to manual review.");
    }
    authOutcomesSentForReview += 1;
  }

  return {claimed: userIds.length, deleted, authOutcomesSentForReview};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runScheduledAccountDeletion().then((result) => {
    process.stdout.write(
      `Account-deletion run finished: ${result.claimed} claim records returned, ${result.deleted} accounts deleted, ${result.authOutcomesSentForReview} Auth outcomes sent to manual review.\n`,
    );
  }).catch(() => {
    process.stderr.write("Account-deletion run failed. Check the protected account state and audit log.\n");
    process.exitCode = 1;
  });
}
