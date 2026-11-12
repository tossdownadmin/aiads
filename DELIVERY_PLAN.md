# Delivery Plan

## Phase 0 — Review and decisions

- Review this planning package.
- Confirm first provider, account connection method, target clients, hosting preference, and whether the first release is dashboard-only or includes report export.
- Approve the read-only safety boundary.

## Phase 1 — Foundation

- Create the application skeleton and environment separation.
- Implement auth, organizations, client profiles, tenant isolation, audit logging, and secrets management.
- Define normalized schemas and provider adapter interfaces.

## Phase 2 — Meta read-only ingestion

- Implement account discovery and status checks.
- Pull 7-day and 30-day data with correct provider date presets.
- Add pagination, retries, rate-limit handling, raw payload retention, normalization, and freshness tracking.
- Build an ingestion diagnostics view.

## Phase 3 — Audit engine and first skills

- Implement account-health and performance-audit deterministic rules.
- Add creative-monitor and budget-optimizer.
- Add evidence references, thresholds, minimum sample rules, and no-data states.

## Phase 4 — Claude and reports

- Add Bedrock adapter with server-side credentials, model configuration, timeout/retry policy, cost telemetry, and structured output validation.
- Build client fact files and report schema.
- Render the first per-client dashboard/report from stored evidence.

## Phase 5 — Slack

- Add client-scoped destination configuration.
- Send high-severity account/data alerts first, then report summaries.
- Add notification deduplication, delivery logs, and safe deep links.

## Phase 6 — Skill governance

- Add registry UI/API, candidate releases, evaluation runs, approvals, changelog, and rollback.
- Add scheduled update checks and an internal review queue.

## Phase 7 — Expansion after validation

- Add Google Ads and other providers through the same adapter contract.
- Add competitive research and copy planning with explicit source limitations.
- Consider paused-only write preparation only after read-only accuracy and approval workflows are proven.

## Verification gates

- Unit tests for calculations and provider normalization.
- Contract tests for provider adapters.
- Fixture tests for each skill and boundary condition.
- Security review for tenant isolation and secret handling.
- Browser verification of representative client flows.
- A staging run against an authorized account with writes disabled.
- Report and Slack delivery verification.
