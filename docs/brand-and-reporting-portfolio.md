# Brand and reporting portfolio

The November 20, 2026 refresh follows the charcoal, warm cream and rose palette observed on https://tossdown.com. The application uses the user-requested Poppins family, hosted locally in five weights. Daily and monthly HTML exports embed the same licensed fonts for offline use. The main workspace stays light for sustained report reading; the navigation and hero panels use charcoal.

`config/active-clients.ts` contains the 15 assigned brands from the supplied team screenshot, matched to actual Meta account IDs. Kulfiwala, Big Apple and Hemani were unassigned. Regal Food and Majestic were removed at the user's request because they were not visible to the token.

Default daily report updates use all available assigned account IDs instead of the prior report's membership. The portfolio template retains existing KPI definitions by account ID. Missing assigned accounts are reported as access gaps, never rematched by a similar name. Explicit custom report selections remain supported, and account selectors continue to list the complete connected account inventory.

The font sources are Google Fonts Poppins latin WOFF2 files. `public/fonts/OFL-Poppins.txt` contains the license. `lib/ui/report-font.ts` embeds those exact five files for portable reports. Saved daily snapshots receive the current presentation styles when opened; their measurements and skill execution records remain unchanged.
