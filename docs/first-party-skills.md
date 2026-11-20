# Tossdown first-party skills

The `Skills (1).zip` archive was reviewed as reference material. It contained six distinct concepts, plus duplicate copies of `budget-optimizer`, `ad-copy-generator`, and `ads-plan`. Its commands, credentials, and examples are not executed or imported. The app uses original, versioned Tossdown methods in `lib/skills/builtin.ts`.

## Available now

| Method | In the app | Evidence used | What it can conclude |
| --- | --- | --- | --- |
| Meta account audit | Account audits | Active campaigns and campaign-level insights for 7 or 30 days | Source-cited account review and data gaps |
| Budget efficiency review | Account audits | Same campaign-level insights, including spend and reported actions | Comparable objective-level review candidates; no numeric budget moves without targets |
| Campaign delivery signals | Account audits | Same campaign-level reach, frequency, CTR, CPC, and spend | Investigation leads; no ad-level fatigue verdict |
| Competitor creative research | Competitor research | Up to 12 selected Foreplay or Meta public ad records | Observable hooks, formats, offers, and CTAs |
| Competitor messaging map | Competitor research | Same selected public ad records | Source-cited messaging comparison across advertisers |

First-party methods are shipped with the app and available without manual registry approval. External skills still require staging and review. Every active method is read-only. A method changes analysis guidance; it does not grant a new API permission or fetch a new level of evidence.

## Archive ideas requiring a separate workflow

| Archive concept | Needed before activation |
| --- | --- |
| `ad-creative-monitor` | Ad-level daily insights, creative IDs, a trend window, and minimum-volume rules. Current campaign aggregates cannot prove creative fatigue. |
| `ad-copy-generator` | A brand brief, permitted asset upload/preview, original-copy review, and a draft output format. Account winners and image understanding must be source-backed. |
| `ad-upload` | A separate Meta write integration, validated assets, dry run, explicit approval, paused creation, readback, and an audit trail. This app currently has no ad-write workflow. |

The archive's `competitive-ads-extractor` language about scraping, “successful” ads, audience targeting, and performance is unsuitable for public library records. The two Tossdown competitor methods analyze only selected, source-labeled records and avoid those claims.

## Client reports

Daily and monthly generation execute `daily-meta-review` and `monthly-meta-plan` packages from `skills/reports/`, including their SKILL.md, declared resources and JSON contracts. They appear in the registry and report selector. The application fetches declared read-only evidence, invokes Claude through Bedrock, validates the response and renders the existing templates. This is a controlled application runtime; it does not execute arbitrary commands from uploaded skills or provide an unrestricted Claude tool session.

Daily updates are resumable private-Blob jobs with one account per HTTP batch and pinned skill contents. The browser advances queued accounts while open; reopening the page offers resume. Each account reviews both 7-/30-day windows with evidence citations. Metrics, outcome definitions, cards and campaign galleries remain application-calculated. Old saved HTML stays available until all accounts pass and the final conditional write succeeds. Old reports are visibly identified as earlier reports until updated.

Each successful analysis retains a private skill snapshot, evidence, validated output, model ID, evidence hash and skill version. Authenticated execution-record links allow inspection. Monthly narrative and creative/budget proposals use the selected monthly skill rather than a separate embedded planning prompt. Optional Foreplay reads remain an explicit user choice.


The Client reports page reads fixed-date campaign and account insights for all delivery in the selected period. Daily reports cover trailing 7- and 30-day windows. Monthly plans use the previous calendar month, disclose partial baselines, show visible dataset activity, and accept period-specific caps, brand guidelines and dated market evidence. A selected research client can supply live Foreplay records for its reviewed advertisers. Each report can be downloaded as HTML or printed to PDF.

## Operating notes

- Account audit methods use only currently active campaigns. Inactive campaigns and ad/ad-set insights are not in these requests.
- Meta-reported actions are not reconciled with the client's analytics or CRM.
- Foreplay and Meta public ads do not expose ordinary spend, ROAS, or conversion outcomes.
- The selected method and SHA are returned with each analysis so a reviewer can identify the method version.
