-- Record append-only audit event insertion time instead of transaction start.
-- This matters when an operation inserts an event after a lock wait; existing
-- rows and all authorization behavior remain unchanged.

alter table private.security_events
  alter column occurred_at set default pg_catalog.clock_timestamp();

alter table private.moderation_events
  alter column occurred_at set default pg_catalog.clock_timestamp();

alter table private.role_change_audit
  alter column occurred_at set default pg_catalog.clock_timestamp();

alter table private.user_report_audit
  alter column occurred_at set default pg_catalog.clock_timestamp();

alter table private.submission_staff_audit
  alter column occurred_at set default pg_catalog.clock_timestamp();

alter table private.evidence_scan_audit
  alter column occurred_at set default pg_catalog.clock_timestamp();
