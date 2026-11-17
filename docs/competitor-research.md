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
- The current browser-saved competitor list is a prototype. Production lists need client-scoped persistence and access rules.

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
