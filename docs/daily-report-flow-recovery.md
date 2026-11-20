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
