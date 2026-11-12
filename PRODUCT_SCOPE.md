# Independent Ads Intelligence System

Status: **Planning draft — review before implementation**  
Date: 12 November 2026

## 1. Product intent

Build an independent, multi-client advertising intelligence system that connects to authorized ad accounts, collects performance data, runs evidence-based audits and optimization analyses, produces client reports, and sends useful Slack notifications.

The first release is an **audit and recommendation system**. It must not silently change live advertising accounts. Any future write capability is a separate, approval-gated phase.

## 2. User request translated into product requirements

1. Support multiple clients, each with isolated organizations, users, brands, accounts, credentials, reports, and notification destinations.
2. Monitor and audit ad accounts using modular, updateable skills.
3. Use Claude through AWS Bedrock from a server-side orchestration layer.
4. Keep skills current through a versioned registry, review workflow, evaluation suite, and scheduled update checks.
5. Connect Slack for alerts, report delivery, and controlled human approvals.

## 3. Scope for the first build

### In scope

- Organization/client tenancy and account registry.
- Meta-first account connection and read-only data ingestion.
- Account health checks and inaccessible-account reporting.
- 7-day and 30-day performance windows.
- Campaign/ad-set/ad-level normalized metrics.
- Audit skills for pacing, efficiency, CTR, frequency, ROAS/CPA, creative fatigue, tracking/data quality, and budget allocation.
- Evidence-backed findings with source, period, confidence, and thresholds.
- Per-client dashboard/report output.
- Slack notifications with deduplication and severity levels.
- Skill registry, versioning, validation, rollback, and evaluation records.

### Explicitly out of scope for the first build

- Automatic campaign activation, budget changes, or creative publishing.
- Unbounded competitor scraping or claims about competitor performance that cannot be observed.
- Invented offers, benchmarks, conversion counts, or business facts.
- Putting provider credentials or Claude credentials in browser code.
- Treating an LLM response as a source of truth without structured evidence.

## 4. Safety posture

- Read-only by default.
- Live writes disabled in development and absent from the initial release.
- Recommendations are proposals, not actions.
- Any later write path must create paused objects, require explicit approval, be idempotent, log every stage, and read back the resulting state.
- Every finding must distinguish observed data, calculated metrics, modeled assumptions, and human-entered client facts.
- Tenant isolation and least-privilege credentials are mandatory, not later hardening.

## 5. Initial skill catalog

The attachment contains these reusable skill concepts:

- `account-health`: connection, billing, permissions, delivery, and data freshness.
- `performance-audit`: spend, impressions, reach, frequency, CTR, CPC, CPA/CPP, ROAS, and objective-aware flags.
- `budget-optimizer`: pacing, efficiency ranking, and bounded reallocation recommendations.
- `ad-creative-monitor`: CTR decay, frequency creep, CPC inflation, fatigue, and refresh recommendations.
- `ad-copy-generator`: evidence-informed copy variants tied to a supplied creative and brand memory.
- `competitive-ads-extractor`: ad-library observation for messaging and format inspiration, with false-positive and non-performance caveats.
- `ads-plan`: objectives, economics, channel/campaign architecture, audiences, budget, creative, measurement, experiments, and governance.
- `report-builder`: fixed client report schema and transparent source notes.

The duplicate files in `Skills.zip` should be consolidated into canonical skill packages before implementation.

## 6. Core product principles

- Evidence before synthesis.
- Scale campaigns before fragmenting structure.
- Guardrails are always visible.
- Recommendations are forward-looking and tied to a decision.
- Major-event advice is included only when a genuine event is documented.
- Competitor research is inspiration, not proof of competitor results.
- No invented offers, facts, or metrics.

## 7. Success criteria for the first release

- A client can connect an authorized Meta account without exposing tokens to the browser.
- A scheduled run can collect both 7-day and 30-day data and explain missing accounts or data.
- Every generated finding links to normalized evidence and the rule/skill that produced it.
- Slack alerts are actionable, deduplicated, and tenant-scoped.
- A reviewer can compare skill versions, approve an update, roll it back, and see evaluation results.
- No live ad mutation occurs without an explicit future approval flow.
