# Daily update failure: 2026-11-20

The production log supplied by the user identifies the Victoria Harbor Cafe failure as the numeric-prose validator. It is not a Meta permission error or a function timeout: the request completed and rejected the analysis wording.

## Correction

- Accept literal measurements only when the metric type and exact source/displayed value match cited evidence. Keep typed numeric placeholders supported. Do not accept a number simply because it occurs elsewhere in the input; for example, spend cannot substantiate a purchase count, and Page-visit cost cannot substantiate CPL.
- Permit the actual source window's day labels/dates and small, explicitly proposed creative test counts. Previously even a correct seven-day label was rejected by the digit guard.
- Include the previous rejected answer and exact validator reason in the bounded repair request. Retry a malformed/truncated JSON response once, as well as a well-formed response that fails evidence checks. Preserve the evidence and original pinned skill.
- Record failed AI responses privately with a reference, without marking the report successful or replacing the previous saved report.
- Surface controlled stage-specific errors and a private error-details link. Keep SDK errors, credentials and arbitrary exception text out of public responses.

## Verification boundary

Regression tests cover VHC's reported Page-visit count and formatted cost, invented metrics, source periods, outcome-type mismatches, PKR formatting, malformed response repair and failed-run provenance. A fifteen-account API integration test exercises the actual date/read adapters, skill loader/runner, validator, resumable job, renderer, private-storage contract and reopen behavior; external Meta, AI and storage services and the approved session are test doubles. This is not a claim that a fresh fifteen-account production/browser run has completed.

Production verification requires the authenticated user to resume the pending update, or an authorized Vercel/application connection. The available CLI login did not have access to the project's scope; the user's runtime log supplies the confirmed production cause.

## Repeated production rejection: reference 42477cf2

The user supplied both actual rejected model responses. The repair fixed the unbound spend-change range, then failed on an optional ad-level claim about daily CTR. Other observations used valid scalar placeholders. Rejecting the entire account for any single unsupported observation kept the portfolio at zero completed accounts.

After the normal strict validation and repair attempts, daily reviews now validate each proposed finding independently with the same evidence guards. Complete, known window coverage and at least one verified AI finding in every reporting window remain mandatory. Unsupported findings are omitted, their private rejection details and raw responses are retained, and the account report is labelled **AI review with limitations**. A limited supporting review also marks the final synthesis as limited. No deterministic performance narrative is substituted for missing AI analysis. Wholly invalid reviews still fail and preserve the old saved report.

Model evidence now includes compact metric labels, so a generic cost-per-result fact retains its actual outcome unit. Cost per ThruPlay cannot be presented as cost per reach. Failed runs now retain the exact model evidence input as well as the failed responses.

Tests cover mixed valid/invalid findings, wrong or incomplete windows, wholly invalid windows, earlier valid observations, complex placeholders, unsupported thresholds, outcome labels, batch-to-synthesis limitations, visible downloadable notes and a complete fifteen-account resumable route flow with repeated optional validation failures. The actual private responses can also be replayed locally using `AIADS_FAILED_OUTPUT_FIXTURE`; the catalog for that replay is explicitly synthetic because the older failed record did not retain its original evidence. This verifies recovery behavior, not the accuracy of those Meta measurements. The private attachment is never committed.

## My Cravings date and missing-value rejection: 2026-11-23

The production update reached ten completed accounts, then rejected all seven-day observations for My Cravings. Both failed outputs contained a correct abbreviated date range, `Nov 16–22`, which the numeric guard mistakenly treated as an invented measurement. The prior-period observation was similarly rejected for `Nov 9–15`. Partial recovery correctly refused to call an empty window complete, leaving the account blocked. The actual evidence confirms no account-level row for the current seven-day window, with previous-period and thirty-day metrics available. This remains a data-availability observation; it is not proof of zero historical delivery or broken tracking.

The validator now recognizes only the actual supplied current and previous reporting ranges in common human-readable formats, including year and month boundaries. Changed endpoints and incorrect years remain rejected. Explicitly missing, cited metric placeholders render as `Not reported`; arbitrary objects and unknown references are still rejected. Percent signs already included in a CTR placeholder are emitted once.

The user supplied the failed outputs and their input. A private local replay includes all 24 cited facts with the actual supplied values, plus comparison windows; unrelated ad copy is excluded. Regression tests cover this replay, wrong dates, fabricated metrics, missing-data versus zero-delivery claims and a fifteen-account route flow that continues through this case after ten completed accounts. No production evidence is committed. The existing job and pinned skill remain compatible; completed accounts are retained.

## Pita Land entity and schedule rejection: 2026-11-23

The live update advanced to eleven completed accounts, then stopped in a thirty-day supporting batch for Pita Land (reference `0f7f7878`). The exact private input and both failed responses identify two supported observations rejected by the numeric guard: ad spend referenced as a named metric within a cited ad record, and a campaign flight range present in its cited delivery record. Bare ad and ad-set identifiers were also mistaken for measurements.

Typed nested placeholders now resolve only existing metric fields in the `stats` object of an explicitly cited ad or ad-set fact. They retain the server's canonical currency, percentage and ratio formatting; explicit null values remain `Not reported`. Whole objects, arbitrary paths, configuration budgets, invented or derived metrics, uncited parents and other windows remain invalid. Operational IDs from a cited entity identify the subject without supplying new KPIs. Exact start/stop ranges from a cited campaign delivery record are recognized as schedule metadata; unrelated dates in copy or uncited records are not.

The private replay uses all 301 original input facts, checks the original input hash, and retains the two supported findings while omitting three observations with unsupported budget or percentage wording. Raw failed drafts and omission reasons remain in the private execution record. The public report continues to disclose limitations. No client evidence is committed and the pinned skill and checkpoint keys are unchanged. Synthetic regression cases cover the same boundaries without private client data.
