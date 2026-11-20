# Daily report analysis upgrade

Approved scope: improve the sample's clarity and practical analysis while retaining measured metrics, saved reports, downloads, account selection and campaign galleries at the end. Replace workspace initials and browser favicon with the user-supplied PNG.

## Evidence and analysis

- Compare each completed 7/30-day window with the immediately preceding nonoverlapping window of equal length, matching campaigns by ID.
- Supply every returned ad/ad-set metric and dated ad observation, including available copy and current settings. Large inputs are split into bounded, resumable skill executions, then validated and synthesized from a size-bounded priority shortlist. Full batch outputs remain in private records. Numeric prose must use bindings to exact supplied scalar measurements; the application inserts the formatted values. Private execution records retain their evidence and skill version.
- Use optional saved per-account business goals, CPA/CPL/ROAS targets and a calendar-month approved budget. Compute pacing only from matching-currency monthly budget and actual month-to-date spend; label projections as estimates.
- Preserve nulls, actual zeros, attribution distinctions, current versus historical state, and Meta permission/rate-limit notes. Do not infer tracking failures, qualified leads, fatigue causality or net profit from absent/insufficient evidence.
- Render wins, concerns, prioritized actions and a portfolio review queue before campaign previews. Keep full supporting evidence available without flooding the main narrative.

## Limits

No campaign writes. No connected CRM qualification, offline-sales reconciliation or margins are assumed. Ad images/videos remain viewable; this skill's analysis is text/data based. Current targeting and eligible placements do not establish performance by demographic or placement. Older saved output remains an earlier snapshot until a new full update succeeds. Previously completed accounts in an old pending job do not silently change skill version.

## Verification

Test nonoverlapping dates, correct identity joins, missing-data fallbacks, budget month/currency matching, full ad coverage, bounded batching, provenance, claim rejection, context authorization/concurrency, escaped report rendering and gallery order. Run full tests, typecheck and production build. Publish only verified files and verify the resulting deployment status; distinguish code deployment from completion of a fresh live report.

Meta source: https://developers.facebook.com/docs/graph-api/reference/adaccount/insights/ (explicit time ranges, time increments and account/campaign/ad/ad-set insight levels).
