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
