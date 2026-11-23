# Brand and reporting portfolio

## November 23, 2026: approved Agency visual language

The approved local mockup adapts the design language observed at `agency.tossdown.com`: locally hosted Inter variable type, cool white and gray surfaces, a light sidebar, rose `#e51451` actions, restrained outline icons, subtle borders, and 14px cards. The production application retains its existing account audits, client reports, competitor research and skills workflows; Agency modules and sample figures are not imported.

The shared shell keeps all five destinations, workspace page search, connection state and mobile navigation. The home screen also links directly to the existing reports page. The underlying API handlers, authentication, campaign permissions, report generation, evidence checks and saved data are unchanged by this presentation update.

`public/fonts/inter-latin-variable.woff2` serves the application font, with its SIL OFL license in `public/fonts/OFL-Inter.txt`. Daily and monthly HTML downloads embed that same font through `lib/ui/report-font.ts` for offline use. Saved daily reports receive the current theme when opened without regenerating or rewriting their measurements or skill records.

Release validation includes TypeScript, the existing regression suites (with private replay fixtures when available), a production build, local desktop/mobile navigation and report presentation checks, followed by verification of the exact GitHub commit and production deployment. Prototype files and private evidence fixtures are excluded from the release.

## Prior November 20 presentation

The November 20, 2026 refresh follows the charcoal, warm cream and rose palette observed on https://tossdown.com. The application uses the user-requested Poppins family, hosted locally in five weights. Daily and monthly HTML exports embed the same licensed fonts for offline use. The main workspace stays light for sustained report reading; the navigation and hero panels use charcoal.

`config/active-clients.ts` contains the 15 assigned brands from the supplied team screenshot, matched to actual Meta account IDs. Kulfiwala, Big Apple and Hemani were unassigned. Regal Food and Majestic were removed at the user's request because they were not visible to the token.

Default daily report updates use all available assigned account IDs instead of the prior report's membership. The portfolio template retains existing KPI definitions by account ID. Missing assigned accounts are reported as access gaps, never rematched by a similar name. Explicit custom report selections remain supported, and account selectors continue to list the complete connected account inventory.

The font sources are Google Fonts Poppins latin WOFF2 files. `public/fonts/OFL-Poppins.txt` contains the license. `lib/ui/report-font.ts` embeds those exact five files for portable reports. Saved daily snapshots receive the current presentation styles when opened; their measurements and skill execution records remain unchanged.
