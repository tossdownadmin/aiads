# Meta operations: first useful release

Owner: Tossdown. Baseline: `1fdd3471296dccb94688f827c345af57dacfc42d`.

## Product decision

The daily starting point is an assigned-account monitoring board, not a directory of tools. A buyer must be able to identify an account needing attention, inspect the exact supporting evidence, take responsibility for the issue, and open the existing campaign review workflow. Ship this complete loop before broadening platforms or automating advertising changes.

## This release

- The existing 15 assigned reporting accounts, matched by ID. An inaccessible account stays visible as unavailable.
- Completed 7-day and 30-day windows in each account's timezone, with equal-length nonoverlapping comparisons. Current configuration is clearly separate from historical results.
- Native Meta Opportunity Score when returned by the official API. It is never replaced with an internal score or treated as a business-performance grade.
- A versioned first-party monitoring skill: source reconciliation, account restrictions, disapproved ads, approved business context, approved account-level cost targets, budget usage, measured efficiency changes, and qualified creative engagement signals.
- A transparent checks score with evaluated-check coverage. Missing evidence does not pass a check. Missing critical source evidence or unreconciled spend withholds the score. Coverage and missing business context remain visible.
- A saved issue queue with owners, review states, notes, snoozes, optimistic concurrency and actor timestamps. A human review state does not assert that a source issue was fixed.
- Immutable private source snapshots and evidence IDs. Exact decimal arithmetic for monetary sums, ratios and comparisons. Different currencies are never added. Reach/frequency/ROAS are never summed.
- A resumable manual portfolio refresh plus authenticated daily scheduled reads using the existing cron secret, with bounded per-account time and isolated failures. Every partial refresh stays visible.
- Source/CSV inspection, version history, and links to profiles and existing reviewed campaign management. No automatic Meta mutations.

## Accuracy contract

Every performance figure has an account, entity, currency/unit, exact reporting range, source field and retrieval timestamp. Derived values retain formula/input IDs. Missing, malformed, duplicate, wrong-currency or wrong-period inputs fail closed. Native account spend reconciles against all campaign spend, including campaigns now paused. A missing insight row is not zero. Missing action counts are not zero results. A zero denominator cannot produce a cost or ROAS. Target comparisons require matching account/currency, a primary outcome and current owner approval valid throughout the period. Account-level costs are explicitly blended across account spend. No invented industry benchmarks, profit claims, qualified-lead claims or guaranteed savings.

These requirements reduce figure errors; they are not a promise that third-party reporting is infallible. Reconciliation must run on live sources after implementation. Attribution timing, restatements, missing permissions and gaps are shown rather than hidden.

## Deferred

Automatic budget moves/pauses; other advertising platforms; CRM/POS profit attribution; a general visual rule builder; Slack/email delivery; automatic promotion of external skills; AI-generated numeric recommendations; generative creative production; billing/tenant expansion. Existing reports, research and campaign editing continue to work.

## User inputs that cannot be invented

Per-account approved business goal, outcome definition, primary outcome, CPA/CPL/ROAS or cost-per-result target where applicable, monthly budget and month, target owner and approval validity. Reuse existing saved profiles. Missing inputs create actionable readiness issues; they do not block measured reporting.

## Release gates

1. Adversarial decimal, null/zero, metric identity, timezone, attribution, pagination, source reconciliation, outcome/target, score-coverage and issue-concurrency tests.
2. Existing regression suite, typecheck and production build.
3. Desktop/mobile interaction checks using explicitly synthetic local fixtures.
4. After deployment, retrieve all assigned accounts read-only, independently reconcile stored source totals/calculations, inspect failures, and verify UI against actual sources. Do not apply advertising changes during verification.

## Primary reference checks

- [Meta Ad Account reference: opportunity_score](https://developers.facebook.com/docs/graph-api/reference/ad-account/).
- [Meta Opportunity Score: meaning and limitations](https://business-auth.facebook.com/business/tools/opportunity-score).
- [Optmyzr Meta rule engine: evidence conditions, review and bounded actions](https://help.optmyzr.com/en/articles/6787066-rule-engine-for-meta-ads).

The implementation is specific to Tossdown's workflow. These references inform the product distinctions; they are not a claim of feature parity.
