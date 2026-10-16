# Phase 7 backup run ledger migration rollback notes

Migration: `20261001040905_mmwr_backup_run_ledger.sql`

## Current state

This is a local rollback plan only. The migration has not been applied to any database. Do not run rollback SQL against Development, Staging, or Production until the target is independently confirmed and backed up.

## Before application

Review the forward migration and this plan together. The schema stores only run identifiers, requested trigger category/actor, phase/status, verification bit, counts, opaque manifest object key, one of the fixed failure codes `backup_failed` / `backup_validation_failed`, and timestamps. The fixed email producer maps these to `backup_failure` / `backup_validation_failure`; it does not store credentials, export contents, provider error text, or source Storage paths. A forward correction to these CHECK constraints or trigger must preserve that boundary and the Critical Security Email OFF default.

## After application, before any backup runs exist

If the application is rejected before a run is recorded, rollback may remove in this order:

1. Public read and write wrapper functions.
2. Private read and write functions.
3. The run audit and failure-email triggers and their trigger functions.
4. The append-only audit triggers and their trigger function.
5. Recent/retention indexes.
6. `private.backup_run_audit` and `private.backup_runs` tables.

Use explicit function signatures from the applied schema and inspect dependencies first. This list is not an executable down migration.

## After any run has been recorded

Do not drop these tables to roll back. The append-only run audit is the operational recovery trail. Disable the worker at its environment flag, preserve the ledger, and deploy a forward-compatible fix. If schema removal is later unavoidable, export and preserve the run ledger and audit records under the Owner's retention policy before a reviewed change.

## Data boundary

Deleting the ledger would not remove opaque R2 objects. Conversely, deleting R2 objects would make successful ledger rows misleading. Any future decommission plan must independently inventory and reconcile both stores; the current R2 adapter intentionally has no delete operation.

