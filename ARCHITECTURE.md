# Architecture Plan

## Proposed system

```text
Client app
  -> API/auth/tenant boundary
  -> Account connection service
  -> Provider adapters (Meta first; Google/TikTok later)
  -> Raw ingestion + normalized metrics store
  -> Audit run orchestrator
       -> deterministic metric/rule engine
       -> versioned skill registry
       -> Claude on AWS Bedrock
  -> evidence-backed findings and reports
  -> Slack notification adapter
```

## Component responsibilities

### Client application

Shows accounts, run history, findings, evidence, reports, skill versions, notification preferences, and approval states. It does not hold provider tokens or Bedrock credentials.

### API and tenancy boundary

Authenticates users, resolves organization membership, enforces tenant-scoped access, and exposes only safe fields to the client.

### Provider adapters

Start with Meta. The adapter owns account discovery, status checks, pagination, rate-limit handling, date presets, retries, and provider-specific error mapping. The normalized internal model must not depend on one provider's response shape.

### Ingestion and storage

Store immutable raw responses where appropriate, normalized entities and metrics, data freshness, source timestamps, and ingestion errors. Preserve source IDs so every finding can be traced back.

### Deterministic audit engine

Computes metrics and applies explicit rules such as minimum spend/sample requirements, frequency thresholds, CTR/CPA/ROAS comparisons, pacing, and data-quality checks. This layer decides what is mathematically true.

### Claude/Bedrock synthesis

Claude receives a constrained evidence packet, skill instructions, client facts, and output schema. It explains findings, prioritizes actions, and drafts recommendations. It must not invent missing values or execute provider writes.

### Skill registry

Stores skill metadata, version, supported providers, input schema, output schema, rules, prompt templates, changelog, tests, evaluation scores, reviewer, and release status.

### Slack adapter

Sends severity-aware notifications to a client-specific channel or webhook. It includes a report link, evidence period, finding IDs, and a safe acknowledgment/approval link where applicable. It must deduplicate repeated alerts.

## Suggested data entities

- `organization`
- `user_membership`
- `client_profile`
- `ad_provider_connection`
- `ad_account`
- `ingestion_run`
- `raw_provider_payload`
- `campaign`, `ad_set`, `ad`
- `metric_snapshot`
- `audit_run`
- `finding`
- `recommendation`
- `skill_package`, `skill_release`, `skill_evaluation`
- `report`
- `notification_destination`, `notification_delivery`
- `approval_request`, reserved for a later write phase

## Run lifecycle

1. Create a tenant-scoped run with a requested period.
2. Discover and status-check accounts.
3. Pull provider data with pagination and bounded retries.
4. Normalize and persist source-linked records.
5. Run deterministic checks.
6. Execute applicable skill versions against the evidence packet.
7. Validate structured output and evidence references.
8. Persist findings and report.
9. Send deduplicated Slack notifications.
10. Record metrics, errors, and skill version for reproducibility.
