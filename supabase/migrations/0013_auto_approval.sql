-- ============================================================================
-- 0013_auto_approval.sql — auto-approval threshold for low-value transfers
-- ============================================================================
-- Adds an auto_approve_threshold column to approval_rules. When a transfer
-- request is below this threshold for the matching rule, the system
-- auto-approves it without requiring human approval.
-- ============================================================================

alter table approval_rules
  add column if not exists auto_approve_threshold bigint not null default 0
  check (auto_approve_threshold >= 0);
