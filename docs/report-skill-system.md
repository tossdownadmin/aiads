# Skill-based reporting implementation

Daily and monthly reporting execute approved, versioned reporting skills. Existing metrics, report templates, account tabs, campaign galleries and downloads stay authoritative. Daily findings/recommendations and monthly narrative come from Claude using the selected skill and its reference files.

## Execution

- Ship daily and monthly SKILL.md packages with method references, declared read capabilities and an output contract. Register them beside the existing audit/research methods. Include all resource content and the contract in each version hash.
- Read-only server adapters collect Meta reporting windows, account/campaign metrics and ad-level evidence. Monthly planning additionally reads dated comparison/tracking evidence and explicitly selected Foreplay evidence. A skill cannot enable an undeclared source, execute arbitrary scripts or write to advertising accounts.
- Supply the actual skill instructions and resources to Claude via Bedrock. Validate the workflow, available evidence, evidence references, structured output and campaign identities before rendering. Calculations and KPI cards remain application code.
- Record skill source/version, resources, model, timestamps, evidence hash and retained input/output artifacts. A saved report does not invoke Claude when opened.
- Daily updates use a durable private Blob job, conditional worker leases and one-account batches. The browser advances the job while open; after interruption the operator can resume. This is not a scheduled background service. Each batch analyzes both dated windows; the final report replaces the saved report only when every account succeeds and the starting saved-report version still matches.
- Pin the approved skill package for a job. Failed validation/model/source reads preserve the previous report and show a retryable failure. Do not silently substitute coded findings or label an old report skill-generated.

## Verification

Check skill/resource hashing and safe loading, unsupported capabilities, actual skill text in model requests, model-output validation, evidence citations, unchanged measured KPIs/templates, private run artifacts, job resume/lease/conflict behavior, failures preserving the saved report, registry/selector routing, HTML downloads and live generation through the approved token/model connections.

## Measurement foundation: 2026-11-23

The first implementation package from the senior ads audit adds a shared measurement renderer and outcome/entity checks to daily reviews, account audits, monthly plans and competitor reviews. Fresh daily/audit/plan executions require exact metric placeholders. Private legacy replays retain their original literal-value compatibility; they do not revalidate or rewrite saved reports. Public creative text can substantiate a cited promotional offer, never a performance metric. The guards reject the reproduced lead-to-purchase substitution, fabricated monthly metrics and unsupported breakeven wording. They are application checks, not proof of every possible natural-language interpretation.

Numeric KPI cards disclose metric, account/campaign selection, reporting dates, currency and cost calculation. Explicit template bindings can use exact campaign IDs, with distinct selections per period. Legacy name selectors require a unique match; ambiguous selections show an unavailable value. Generic visit counts and cost denominators use the same Facebook or Instagram outcome. Nonadditive reach/frequency/rates are not summed across campaigns.

Account audits default to all campaigns with results in the selected completed period, including paused historical delivery. The active-only scope remains explicit and does not inherit account-wide totals. Audits collect the same full dated evidence used by daily reporting. Accounts needing more than four supporting batches are directed to the resumable daily workflow instead of silently truncating the audit. Current account/disapproval notices are independent of optional AI findings.

The per-account business profile is shared across audits, reports and plans. It includes the primary outcome and definition, service markets, targets, budget month, offers, restrictions and target approval owner/dates. Readiness is visible for the assigned portfolio. Missing or expired approvals prevent budget pacing and monthly allocation recommendations; incomplete profiles prevent target-attainment claims. Qualification notes remain team-reported. No profile values or verified business outcomes are inferred.

Generated reports show available review checks and distinguish complete, limited and unavailable assessments. Findings are deduplicated within the same category/severity and overlapping evidence; distinct issues remain. Private runs identify `measurement-v2`, and checkpoint keys include the validator version. Earlier saved reports are labelled as using earlier checks and require regeneration to adopt this package. Existing completed report artifacts remain intact until a new full update succeeds.

Validation: 198 automated tests pass; three opt-in private replay tests also pass when their local fixture paths are supplied. These include the fifteen-account route/storage flow, exact My Cravings/Pita failure replays, wrong outcome/entity/numeric claims, current/expired approvals, monthly allocation gating, disapprovals, sparse coverage and deduplication. Production compilation and TypeScript checks pass. Private client evidence is excluded from source publication.

Remaining audit work includes autonomous background jobs/history, operational daily checks, CRM/POS reconciliation, creative asset inspection and test follow-up, larger monthly evidence coverage, skill curation and model/source telemetry. The current browser-driven update still requires the page to remain open. Campaign editing scopes are not required for this package; ad-account adapters remain read-only. Account managers must supply approved client profiles before strategy readiness can become complete.
