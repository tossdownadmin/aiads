# Meta operations release verification — November 27, 2026

## Release and scope

The first monitoring release was published as `2c89ec7fe4be3a737cd64263793240078734daa1` on main. Verification used the authenticated production workspace and the existing assigned portfolio. All advertising access during verification was read-only; monitoring source snapshots were saved privately. No campaign, ad-set, ad, creative or delivery setting was applied.

## Live-source checks

- All 15 assigned accounts were retrieved for both completed 7-day and 30-day windows: 30 immutable source snapshots.
- An independent Python verifier, using Python Decimal rather than the TypeScript application calculator, checked 2,225 available source and calculated values, entity/currency/date identity, calculation inputs, comparison windows, coverage counts and native score identity. No discrepancies were found in those checks.
- Account spend matched the exact campaign spend sum in 13 seven-day snapshots and 14 thirty-day snapshots. The remaining snapshots had no account insight row; they remained unavailable, not zero. There were no nonzero spend-reconciliation discrepancies in this captured set.
- Native Meta Opportunity Scores were returned for 13 accounts. Missing scores remained unavailable.
- None of the 15 stored business profiles supplied the complete outcome/definition/approval inputs needed for target-based decisions. Internal checks scores were therefore withheld. The board does not turn incomplete coverage into a positive performance grade.
- Currency/date groups were kept separate, including account timezones whose completed reporting dates differ.

These results apply to the captured source responses, not to every historical report or future Meta restatement. Source availability, recent attributed conversions and business context remain explicit limitations.

## Presentation and write-unit correction discovered during verification

The runtime's locale currency formatter defaults to zero display decimals for PKR. That is unsuitable for exact source-money display. More seriously, the prior campaign editor derived Meta write subdivisions from the same locale preference. Meta documents a PKR offset of 100. The corrected implementation uses the official Meta offset table rather than Intl display defaults for budget/bid conversion and explicit source-money precision. It also covers Meta currencies whose API offsets differ from ISO/locale conventions.

New financial requests carry a pinned currency contract. Cached clients without that contract, and older pending financial reviews without it, must reload and create a fresh review. Nonfinancial review operations retain the existing flow. Test coverage includes PKR paisa, zero-offset currencies, BHD's Meta-specific offset, negative fractional deltas and stale financial review rejection. No prior tool write records were found in the four assigned PKR account histories checked during this verification.

[Meta's documented currency offsets](https://developers.facebook.com/documentation/ads-commerce/marketing-api/currencies).

## Automated and UI checks

- 271 tests across 40 files passed, including the existing report replay and management safeguards.
- Production build/type checking passed.
- Synthetic local desktop/mobile checks covered the board, account detail, source ledger, saved team review state, assignment, shared profiles and period selection.
- A daily 7-day monitoring route is configured for 07:15 UTC using the existing server cron secret. Configuration was verified; the first automatic scheduled completion has not yet been observed. Thirty-day monitoring is refreshed manually.

## Remaining operator inputs

For each account: approved business goal, exact measured outcome/definition, applicable account-level cost/ROAS target, monthly budget/month, owner and approval validity. Leave unknown values blank. An account-matched input CSV was provided separately; no client targets, spend data, private source responses or credentials are committed with this report.

## Reproduce source verification

Export authenticated immutable snapshots to private local files, then run:

```sh
python3 scripts/verify-monitor-snapshots.py /private/tmp/aiads-live-monitor-act_*-7d.json /private/tmp/aiads-live-monitor-act_*-30d.json
```

The verifier requires no provider credentials, network requests or advertising writes. Its JSON result is private operational evidence. A new source read must be assessed for attribution restatements rather than silently overwriting the earlier snapshot.
