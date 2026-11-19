# Skills Registry

The registry shows first-party Tossdown methods and reviewed external skills. First-party methods are versioned with the application in `lib/skills/builtin.ts`; external staged and approved versions are stored in private Vercel Blob. Skill source text is never exposed publicly. See [first-party skills](first-party-skills.md) for current capabilities and limits.

## Add a source

Add a repository and one or more paths to `config/skill_sources.yaml`. Sources are fetched into staging, pinned to a commit SHA, parsed, classified, scanned, and held for approval. They are never automatically promoted. The daily Vercel Cron invokes `/api/skills/sync` with `SKILLS_SYNC_CRON_SECRET`.

## Add a tool mapping

Add the foreign tool name and its internal equivalent to `config/tool_map.yaml`. If no safe equivalent exists, the adapted skill must remain `needs_adaptation`.

## Safety rules

Fetched scripts are never executed. Skills containing prompt injection, credential exfiltration, hidden instructions, or unsafe remote execution are rejected. Repository-level licenses and per-skill license declarations are shown in review; unlicensed skills remain reference-only. First-party read-only methods ship with the app and do not enter the external review queue.

Approving a skill only allows its audit guidance to be used. It does not grant advertising platform permissions or authorize account changes. The audit workspace reads campaign insights only; campaign writes require a separate, explicitly designed approval and execution flow.

## Claude analysis

The audit endpoint sends the approved skill text and the selected Meta campaign insights to Claude through Amazon Bedrock's Converse API. For a Bedrock API key, configure `AWS_REGION`, `AWS_BEARER_TOKEN_BEDROCK`, and `BEDROCK_MODEL_ID` in the server environment. AWS also supports SDK credentials as an alternative. Long-term Bedrock API keys expire and AWS recommends short-term credentials for production; short-term keys last at most 12 hours and need an automatic refresh flow. If Bedrock is not configured, deterministic Meta metrics and threshold flags still work and the workspace reports that Claude analysis is unavailable.

## Versioning

Every staged update keeps its upstream SHA and scan results. An approved version remains active until a later version is reviewed and approved.
