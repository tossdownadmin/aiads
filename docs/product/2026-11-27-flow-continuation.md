# Campaign operations flow continuation

## Delivered behavior

The connected journey is Monitoring → Performance & actions → exact campaign/ad → review → verified execution record → measured follow-up. Campaign history reads the latest reconciled monitoring ledger for the original finding's account and reporting length. The follow-up retains the original evidence, uses the same entity, metric, currency and formula, and excludes the entire change day. It waits for a full seven or thirty completed days. Observations do not establish causality, profit, lead qualification or a creative-test winner. A partial or uncertain execution does not qualify. No advertising mutation is performed to validate this feature.

New campaign report reads share monitoring's configuration mapper. Only delivering ad sets whose reporting spend reconciles with the campaign can select a primary outcome. Explicit website purchases, website leads, adds to cart and checkouts have distinct measurements. Profile goals need a single explicit Facebook Page or Instagram destination. Campaign names, business intent and incidental action counts do not select results. Quality-lead and combined/unsupported goals stay unavailable. Previous dated measurements can be compared by a named current metric; today's settings do not prove the historical configuration. Report and campaign-detail reads now use account attribution settings with impression-date reporting, as monitoring does.

Direct Instagram profile visit metrics are collected when Meta supports that field. Only an explicit unsupported-field response permits a retry without it; permission, rate-limit and other failures are retained. Its exact request fields and scalar source field remain in the ledger. Ad scalar evidence is retained even when a later run has no warning, so follow-up is possible after an engagement warning disappears. Old saved reports remain historical artifacts; they are not rewritten.

## Durable reports

Start returns the saved job immediately. Next.js `after` starts one bounded account/checkpoint. An authenticated Vercel cron at one-minute intervals resumes only running jobs, including recovery after an expired worker lease. Private Blob ETag claims serialize processing and final saves. Model batches and exact prepared input remain checkpointed; each account pins the reporting skill.

A failed account is recorded separately while the remaining accounts continue. Once only failed accounts remain, the job stops. Automatic workers never retry failed jobs. The operator chooses Retry failed accounts; completed accounts are reused. No partial portfolio silently replaces the last complete report. A temporary optional-context storage outage remains an explicit retry rather than silently discarding saved inputs. Missing account totals remain an explicit source limitation instead of blocking all other campaign evidence.

The Reports screen polls read-only state and explains that the browser can close. Without a configured CRON_SECRET it instead explains that background scheduling is unavailable and offers a manual checkpoint. Discard remains unavailable during an active lease.

## Deployment and verification

Existing Vercel team plan was observed as Pro; no plan, permissions, credentials or billing settings were changed. The existing CRON_SECRET protects the report worker. The new cron runs only report checkpoints; it cannot execute campaign changes. Idle jobs do not invoke Meta or the model. Relevant primary documentation: [Next.js after](https://nextjs.org/docs/app/api-reference/functions/after), [Vercel cron](https://vercel.com/docs/cron-jobs), [Meta ad-set fields](https://developers.facebook.com/docs/graph-api/reference/ad-campaign), [Meta Insights](https://developers.facebook.com/docs/graph-api/reference/adaccount/insights/).

Regression coverage includes the fifteen-account report flow, malformed-model repairs, failed-account isolation, reuse of completed work, expired leases, cron authentication, source-identity and currency matching, missing versus zero outcomes, unsupported combined destinations, exact website events and full-window follow-up gates. Local UI checks use synthetic fixtures and disabled ad execution. Live-source and deployment checks are recorded separately after publication.
