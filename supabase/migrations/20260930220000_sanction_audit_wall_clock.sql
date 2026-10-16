-- Sanction creation/lift may wait for profile and advisory locks before
-- rechecking authorization and expiry. Record the actual insert time rather
-- than the transaction-start timestamp.
alter table private.account_sanction_events
  alter column occurred_at set default pg_catalog.clock_timestamp();
