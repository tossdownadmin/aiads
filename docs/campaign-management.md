# Campaign management

Owner: Tossdown. Approved direction: extend this application from reporting into campaign creation and editing, retaining the Agency design language. No live advertising changes are part of implementation or testing.

## Operator flow

Choose a connected account, then browse Campaigns → Ad sets → Ads. Inspect current configuration before editing. Use the adjacent editor for names, delivery, budgets, bids, schedules, audience, placements, conversion settings and creative selection. Review the exact before/after values, account currency and delivery effect before applying. Read the receipt and Meta object IDs after execution.

New campaigns, ad sets and ads are created PAUSED. Build a launch in stages: campaign, ad set, creative, ad. Enable only the specific reviewed objects when the operator is ready to start spending. Pausing also goes through review. Creative replacement creates a separate creative or attaches an existing account creative to the selected ad; it never rewrites a shared creative underneath other ads. Assets support JPEG/PNG uploads up to 2 MB and public HTTPS video imports; video processing remains Meta’s responsibility.

## Supported scope

- Campaigns: create; edit name, daily/lifetime delivery budget, bid strategy and spending cap; pause/enable.
- Ad sets: create; edit name, delivery budget, bid amount/strategy, schedule, audience, placements, optimization, billing, attribution and promoted conversion object; pause/enable.
- Ads: create, rename, pause/enable, and replace their creative.
- Creatives: existing-post, image/link and video creative creation, selection from account resources, and replacement on a specific ad. Advanced object-story settings are reviewed as supplied; Meta remains the final validator of format/objective compatibility.
- Account assets: read Facebook Pages, pixels, images, videos and creatives; upload images or import videos.
- Change records: private team history, operator-bound expiring reviews, execution receipts and partial-failure state.

Immutable objectives are selected at creation. Budget ownership must follow campaign vs. ad-set budgeting. The tool does not provide irreversible deletion, billing/payment administration, or an unrestricted Graph API console. Fields outside the supported editor remain in Ads Manager. These limits must be visible rather than implying every Meta product is implemented.

## Authorization and configuration

The existing verified Google sign-in and email allowlist protect every management read and write. Credentials stay server-side. A connection must have `ads_management`; the system user must have ADVERTISE or MANAGE access to the selected account. Page and business permissions may also be required for creative creation. A token does not gain permissions by changing a local setting.

`META_WRITE_ENABLED=true` enables the server write gate. `META_WRITE_ACCOUNT_IDS` lists the exact writable accounts, separated by commas, with `act_` prefixes. An empty list permits no writes; there is no wildcard. Existing Meta token and private Vercel Blob credentials are also required. Status distinguishes missing configuration, missing permission and missing account role without returning tokens. Reporting remains available when editing is disabled.

## Execution contract

All mutations require same-origin JSON requests. Preview validates an allowlisted operation, checks object ownership, reads parents and current configuration, stores a private ten-minute review and binds its operation/dependencies to a digest. Only its preparing operator can execute it. The server reloads the approved payload, rechecks access and rereads dependencies. A stale or expired review is rejected.

A conditional ETag write claims the review before any Graph POST, preventing double execution across tabs or operators. A separate account lease serializes this tool’s writes, with a second dependency check after claiming it. Unknown outcomes keep the lease until its ten-minute expiry. Mutating Meta requests are never automatically retried. Each step is journaled before submission; returned IDs are retained before verification. Readback distinguishes configured from effective delivery state. Multi-step creative replacement stops on the first failure. Partial success does not trigger an automatic rollback or another launch. Unknown outcomes require reconciliation in Ads Manager. Meta does not offer a transaction across these steps; a change made after preflight may still race an external operator.

## Validation and rollout

Run regression tests for sign-in, origin checks, account/entity ownership, write gates, exact budgets/currencies, paused creation, creative targeting, expired/stale/operator-mismatched reviews, double submission, readback and partial/unknown outcomes. Run existing report suites, TypeScript and production build. Inspect the real UI at desktop and mobile sizes. Publish only the management changes over the verified current `main`; preserve existing unrelated workspace changes. Verify production capability status before describing editing as enabled. Never use real campaigns as test fixtures.

Sources: [Meta campaign reference](https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-campaign-group), [ad-set reference](https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-campaign), [creative reference](https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-creative), [ad reference](https://developers.facebook.com/docs/marketing-api/reference/ad-group). Checked November 24, 2026.
