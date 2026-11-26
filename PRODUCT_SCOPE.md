# Tossdown Ads Intelligence

Status: **Reporting, research and reviewed campaign management live; Meta operations monitoring live with source verification**
Product owner: Tossdown

## Product intent

One workspace for Tossdown operators to audit connected advertising accounts and research competitor ads. The Resilia material is a workflow and UI reference only; this product uses Tossdown naming, styling, data, and integrations.

The November 24 expansion adds campaign, ad-set, ad and creative management, with server-side account permissions, before/after review, paused creation, explicit delivery changes and private execution history. See [campaign management scope and execution contract](docs/campaign-management.md). Existing audits, reports and research remain read-only advertising workflows; mutations are confined to the reviewed management endpoint.

## Current delivery focus

The Monitoring home brings the assigned Meta portfolio, native Opportunity Scores, versioned deterministic checks, exact source reconciliation, a team action queue, and shared business profiles into one operational workflow. The November 27 release scope, deferred work and verification gates are defined in [Meta operations release](docs/product/2026-11-27-meta-operations-release.md). All advertising changes continue through the existing human review flow.

## V1 work areas

### 1. Account audits

- Select a connected Meta ad account and reporting window.
- Discover the account's currently active campaigns and collect campaign insights with pagination.
- Show campaign evidence and deterministic review flags before AI interpretation.
- Use an approved audit skill with Claude through AWS Bedrock for evidence-bound narrative and recommendations.
- Clearly label missing metrics and attribution limits. Read-only; no campaign writes.

### 2. Competitor research

- For each client brand, start with four researched competitor domains, confirm Foreplay advertiser matches, and maintain up to ten saved advertiser IDs; fetch their active ads with optional format and platform filters.
- Keep Meta's separate phrase, country, platform, delivery status, media type, and advertiser Page search for its supported markets.
- Display ad creative/copy, advertiser, platforms, delivery dates, source, and a link to the original ad record.
- Allow selecting saved search results for a skill-guided creative-pattern analysis.
- Do not claim competitor spend, conversions, ROAS, or winning performance unless the source explicitly provides it.
- Use a provider adapter so Meta's Ad Library API and a licensed data provider can be selected without rebuilding the UI.

## Data-source boundary

Meta's official Ad Library API supports ads delivered to the UK/EU within its documented window and political/issue ads globally. It does not supply general commercial ads delivered only in most non-EU markets. Those searches need a separately licensed provider such as Foreplay, or a manual public-library link workflow. The ad-library record is not performance data.

The current branch includes the Meta source and a Foreplay brand ads adapter behind Google sign-in and an email allowlist. Foreplay also requires a Tossdown-owned API key. Its brand ads endpoint does not document a delivery-country filter. The seven researched client shortlists are candidates, and no Foreplay advertiser or active ad has been verified live yet.

## Current repo baseline and gaps

Already present: skill registry/staging, server-side Meta token, a basic campaign-level 7/30-day audit, Bedrock request path, Vercel Blob skill storage, and a read-only UI.

Verified Google sign-in and the configured email allowlist now protect audits, reports, management, skills and paid research. Pagination, ad-set/ad-level detail, shared client context, saved daily reports and resumable reviews are implemented. Remaining product work includes client-isolated provider connections, Slack delivery, a retention/deletion policy and broader operational limits. This remains an internal operator workspace, not a client-tenant product.

## V1 acceptance

- Account audit includes all active campaigns returned by Meta, not only the first page or currently delivering campaigns.
- Each finding cites the campaign and period/evidence it used; rules are labeled as review signals.
- Competitor results identify their source and show coverage/data limitations inline.
- A search without source access fails clearly and does not display fabricated sample ads as live results.
- AI analysis cannot alter ad accounts and cannot invent performance data absent from the source.
- No vendor API key is enabled on the public deployment before the paid-source access boundary is resolved.

### Monitoring simplification (2026-11-27)

Use Meta campaign objectives, current ad-set optimization goals and explicit conversion events automatically. Account SALES/LEADS intent is context, not an override. Business profiles/targets are optional. Separate source/delivery score from performance evidence; omit unsupported comparisons and retain exact numeric lineage. See the v1.1.0 method and release note.

### Campaign operating workflow (2026-11-27)

The Campaigns workspace now connects source performance and goal-specific review findings to exact entity settings and human-reviewed changes. Immutable finding evidence can be retained in the draft and execution record, while owner acknowledgments remain separate from actual source resolution. Account audits share the dated evidence view; report target setup is optional; approved skill methods can be inspected in the registry. Numeric monthly allocation still requires supplied commercial inputs. See [operations workflow release](docs/product/2026-11-27-operations-workflow.md). Background AI portfolio report execution, fuller result-metric coverage and business-system reconciliation remain distinct future work.
