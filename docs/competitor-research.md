# Competitor research module

## User flow

1. Open **Competitor research** from the Tossdown Ads Intelligence home.
2. For Foreplay, name the client brand, look up 5–10 competitor domains, verify each returned advertiser, and save its Foreplay brand ID. Fetch active ads for the selected IDs. Meta's separate source remains a keyword/Page ID search.
3. Review source-labeled cards and open the original ad-library record.
4. Select ads and request a skill-guided analysis of hooks, claims, offer framing, formats, CTA, landing-page cues, and repeated creative patterns.
5. Treat the analysis as creative research. It is not an estimate of competitor spend or conversion performance.

## Source adapters

### Meta Ad Library API

- Server-only token: `META_AD_LIBRARY_TOKEN`.
- Search endpoint: Graph API `/ads_archive`.
- Country and ad type are required. Search terms support exact phrase or unordered keyword; Meta does not translate the query.
- Results should be paginated with Meta cursors, not by exposing the `paging.next` URL, which may contain credentials.
- Ordinary ads are available through the API when delivered in the UK/EU within the applicable window. Outside those regions, the API returns political/issue ads only. This is a material coverage restriction for Tossdown's commercial competitor research.
- The regular public Ad Library website remains a manual fallback for commercial ads outside the API's coverage.

### Foreplay brand ads provider

- Use `/api/brand/getBrandsByDomain` to return candidate advertisers; require a human to confirm the match because Foreplay says domain results are not guaranteed associations.
- Use `/api/brand/getAdsByBrandId` with the confirmed IDs, `live=true`, and cursor pagination. Limit each page to 20 ads. The endpoint does not document a delivery-country filter; do not label an ad as Canadian on that basis alone.
- The API key belongs to Tossdown and stays server-side. Brand lookup is one credit per successful call; returned ads are one credit each.
- Foreplay's API addendum permits API data in a product for authenticated users. The current placeholder session check is insufficient, so paid routes stay disabled until real sign-in is implemented.
- Cache returned text and metadata for at most 30 days. Link media directly to Foreplay-provided URLs and do not copy it to Tossdown storage.
- The seven starter client brands and four research candidates each live in `lib/competitors/catalog.ts`. These are editorial suggestions, not verified Foreplay advertiser records or evidence of active ads.
- The `/competitors` screen resolves each candidate domain through Foreplay after Google sign-in, asks the user to confirm the matching advertiser, and stores chosen advertiser IDs per client in private Vercel Blob. Confirmed lists are shared across allowlisted users.
- Domain lookup no longer falls back to a broad name search when Foreplay has no domain match. Previously saved matches lack a review marker; the UI excludes them from new searches until the operator reviews each one. The operator can keep or discard those existing matches without another paid lookup.
- Google sign-in requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, and `AUTH_ALLOWED_EMAILS`. Use a Google OAuth Web application with redirect URI `https://aiads-lac.vercel.app/api/auth/callback/google`. Set `AUTH_ALLOWED_EMAILS` to the approved operator email in Vercel. The Foreplay key stays server-side.
- The Foreplay search endpoint accepts only advertiser IDs already saved for the selected client brand. Foreplay's brand ads API has no country filter, so observed ads may be from outside the client's market.

## Normalized ad record

`source`, `sourceAdId`, `advertiserName`, `advertiserPageId`, `creativeText[]`, `headline[]`, `description[]`, `cta`, `platforms[]`, `mediaType`, `firstSeenAt`, `lastSeenAt`, `activeStatus`, `snapshotUrl`, and optional `landingPageUrl`.

Fields absent from a source remain null. Never synthesize impressions, spend, conversions, ROAS, performance rank, or a winner label.

## Analysis contract

- Input only selected, bounded records and the approved competitor-analysis skill.
- Output patterns, evidence references, caveats, and source IDs.
- Mark a claim as repeated only when it is present in multiple selected records.
- Avoid copying competitor wording verbatim into suggested Tossdown creative. Extract the strategic pattern, then write original, brand-grounded concepts.
- No download, republish, or creative remix action in V1.

## Operational limits

- Search result page size capped at 50 records; explicit cursor pagination.
- Bound query terms, page IDs, and number of ads sent to the model.
- Show source, retrieval time, date scope, coverage note, and API error category.
- Persisted history and saved ads require tenant-scoped authorization and a defined retention policy.
