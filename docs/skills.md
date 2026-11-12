# Skills Registry

The registry is the source of truth for advertising skills used by the agent. Staged skill versions are stored in a private Vercel Blob store; source text is never exposed publicly.

## Add a source

Add a repository and one or more paths to `config/skill_sources.yaml`. Sources are fetched into staging, pinned to a commit SHA, parsed, classified, scanned, and held for approval. They are never automatically promoted. The daily Vercel Cron invokes `/api/skills/sync` with `SKILLS_SYNC_CRON_SECRET`.

## Add a tool mapping

Add the foreign tool name and its internal equivalent to `config/tool_map.yaml`. If no safe equivalent exists, the adapted skill must remain `needs_adaptation`.

## Safety rules

Fetched scripts are never executed. Skills containing prompt injection, credential exfiltration, hidden instructions, or unsafe remote execution are rejected. Any skill that suggests a live ad write must pass through the application's explicit confirmation flow.

## Versioning

Every staged update keeps its upstream SHA and scan results. An approved version remains active until a later version is reviewed and approved.
