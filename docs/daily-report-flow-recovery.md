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
