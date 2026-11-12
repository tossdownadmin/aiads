# Attachment Review

## Documents reviewed

- `Daily-Reports-and-Next-Month-Ad-Plan-Nov2026.zip`: four next-month ad-plan PDFs and one self-contained Meta daily-report HTML artifact.
- `Skills.zip`: ten Markdown files, including duplicate copies of `ads-plan`, `ad-copy-generator`, and `budget-optimizer`.

## Useful reference material extracted

The daily-report workflow describes account discovery, 7-day and 30-day pulls, inaccessible-account handling, threshold flags, account summaries, campaign tables, issues, and recommendations. It explicitly distinguishes the `date_preset` shape from an invalid `time_range` shape. The report artifact is a client-facing, self-contained HTML report with period switching, account cards, KPIs, campaign tables, issue rows, and recommendations.

The skill files describe creative fatigue monitoring, budget optimization, ad copy generation, competitor ad-library research, paid-media planning, and an upload workflow with dry-run/paused-only safeguards.

The PDFs are sample next-month planning outputs. They are useful as examples of report depth and client-facing planning, but their client facts, budgets, offers, benchmarks, and recommendations must not be copied into a new tenant without verified source data.

## Instructions versus reference content

The attached files contain imperative workflow language such as “discover accounts,” “pull data,” “publish as artifact,” and specific tool names. Those are instructions for the original report-generation workflow. They are not authorization to connect accounts, publish reports, send Slack messages, or write live ads in this planning task.

The user's request controls the product direction: build an independent multi-client system, use Claude through AWS, maintain updateable skills, connect Slack, and begin with a reviewed plan. Therefore this turn creates planning documentation only.

## Risks and corrections for the product design

- Do not make Artifact publishing a core dependency; keep report rendering behind an application report interface.
- Do not assume the named MCP calls are available in the independent app; isolate them behind provider adapters.
- Do not treat ad-library presence as proof of competitor performance.
- Do not let the model calculate metrics that should be deterministic.
- Do not import duplicated skill files as separate production skills.
- Do not enable upload or activation until a separate approval and safety design is reviewed.
