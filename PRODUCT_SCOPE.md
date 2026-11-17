# Tossdown Ads Intelligence

Status: **Build in progress — read-only V1**
Product owner: Tossdown

## Product intent

One workspace for Tossdown operators to audit connected advertising accounts and research competitor ads. The Resilia material is a workflow and UI reference only; this product uses Tossdown naming, styling, data, and integrations.

## V1 work areas

### 1. Account audits

- Select a connected Meta ad account and reporting window.
- Discover the account's currently active campaigns and collect campaign insights with pagination.
- Show campaign evidence and deterministic review flags before AI interpretation.
- Use an approved audit skill with Claude through AWS Bedrock for evidence-bound narrative and recommendations.
- Clearly label missing metrics and attribution limits. Read-only; no campaign writes.

### 2. Competitor research

- For each client brand, maintain a reviewed list of five to ten competitor domains and verified Foreplay brand IDs; fetch their active ads with optional format and platform filters.
- Keep Meta's separate phrase, country, platform, delivery status, media type, and advertiser Page search for its supported markets.
- Display ad creative/copy, advertiser, platforms, delivery dates, source, and a link to the original ad record.
- Allow selecting saved search results for a skill-guided creative-pattern analysis.
- Do not claim competitor spend, conversions, ROAS, or winning performance unless the source explicitly provides it.
- Use a provider adapter so Meta's Ad Library API and a licensed data provider can be selected without rebuilding the UI.

## Data-source boundary

Meta's official Ad Library API supports ads delivered to the UK/EU within its documented window and political/issue ads globally. It does not supply general commercial ads delivered only in most non-EU markets. Those searches need a separately licensed provider such as Foreplay, or a manual public-library link workflow. The ad-library record is not performance data.

The current branch includes the Meta source and a staged Foreplay brand ads adapter. Foreplay requires a Tossdown-owned API key and authenticated app users before paid requests can be enabled. Its brand ads endpoint does not document a delivery-country filter.

## Current repo baseline and gaps

Already present: skill registry/staging, server-side Meta token, a basic campaign-level 7/30-day audit, Bedrock request path, Vercel Blob skill storage, and a read-only UI.

Still missing for production completeness: real authentication and client tenancy, per-client provider connections, persistent audit/search history, full account and campaign pagination, ad-set/ad-level audit depth, live competitor source credentials and source entitlements, Slack delivery, retention/deletion policy, and production operational limits. The current `verifyAdminSession` is a placeholder that accepts every request; do not treat the deployed prototype as a secured multi-client product.

## V1 acceptance

- Account audit includes all active campaigns returned by Meta, not only the first page or currently delivering campaigns.
- Each finding cites the campaign and period/evidence it used; rules are labeled as review signals.
- Competitor results identify their source and show coverage/data limitations inline.
- A search without source access fails clearly and does not display fabricated sample ads as live results.
- AI analysis cannot alter ad accounts and cannot invent performance data absent from the source.
- No vendor API key is enabled on the public deployment before the paid-source access boundary is resolved.
