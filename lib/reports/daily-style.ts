// Presentation of the supplied daily report, scoped to its standalone document.
export const dailyStyles = `:root{
  color-scheme:light;
  --bg:#f5f6f8;--surface:#fff;--surface2:#f0f1f4;--border:#e2e4e9;
  --fg:#111827;--fg2:#4b5563;--fg3:#9ca3af;
  --accent:#2563eb;--accent-bg:#eff6ff;
  --good:#059669;--good-bg:#ecfdf5;
  --warn:#d97706;--warn-bg:#fffbeb;
  --crit:#dc2626;--crit-bg:#fef2f2;
  --font-body:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  --font-mono:'IBM Plex Mono',ui-monospace,SFMono-Regular,Consolas,'Courier New',monospace;
}
*,*::before,*::after{box-sizing:border-box}
body{font-family:var(--font-body);background:var(--bg);color:var(--fg);margin:0;font-size:14px;line-height:1.5}

.header{background:var(--surface);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:100}
.header-inner{max-width:1200px;margin:0 auto;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.logo-area{display:flex;align-items:center;gap:10px}
.logo-mark{width:32px;height:32px;background:var(--accent);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.logo-mark svg{width:18px;height:18px}
.header-title{font-size:15px;font-weight:700;letter-spacing:-.01em}
.header-subtitle{font-size:12px;color:var(--fg3);font-family:var(--font-mono)}
.header-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.badge{padding:3px 10px;border-radius:100px;font-size:11px;font-weight:600;letter-spacing:.03em;white-space:nowrap}
.badge-blue{background:var(--accent-bg);color:var(--accent)}
.badge-green{background:var(--good-bg);color:var(--good)}

.period{display:inline-flex;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:2px}
.period button{border:0;background:none;padding:5px 12px;border-radius:6px;font:inherit;font-size:12px;font-weight:600;color:var(--fg2);cursor:pointer}
.period button.on{background:var(--surface);color:var(--accent);box-shadow:0 1px 2px rgba(0,0,0,.08)}

.tabs-bar{background:var(--surface);border-bottom:1px solid var(--border);overflow-x:auto;scrollbar-width:none;position:sticky;top:61px;z-index:99}
.tabs-bar::-webkit-scrollbar{display:none}
.tabs{max-width:1200px;margin:0 auto;padding:0 16px;display:flex}
.tab{padding:11px 18px;font:inherit;font-size:13px;font-weight:500;color:var(--fg2);cursor:pointer;border:0;background:none;border-bottom:2px solid transparent;white-space:nowrap;display:flex;align-items:center;gap:6px}
.tab:hover{color:var(--fg)}
.tab.active{color:var(--accent);border-bottom-color:var(--accent);font-weight:600}
.flag-dot{width:6px;height:6px;border-radius:50%;background:var(--warn);flex-shrink:0}
.flag-dot.crit{background:var(--crit)}

.main{max-width:1200px;margin:0 auto;padding:24px 16px}
.section-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--fg3);margin:0 0 10px}

.kpi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:24px}
.kpi-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px}
.kpi-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--fg3);margin-bottom:4px}
.kpi-value{font-family:var(--font-mono);font-size:22px;font-weight:500;line-height:1.2;font-variant-numeric:tabular-nums}
.kpi-sub{font-size:11px;color:var(--fg3);margin-top:2px}
.kpi-card.highlight{border-color:var(--accent);background:var(--accent-bg)}
.kpi-card.highlight .kpi-value{color:var(--accent)}
.kpi-card.crit{border-color:#fecaca;background:var(--crit-bg)}
.kpi-card.crit .kpi-value{color:var(--crit)}

.table-wrap{overflow-x:auto;border-radius:10px;border:1px solid var(--border);background:var(--surface);margin-bottom:24px}
table{width:100%;border-collapse:collapse;font-size:13px;min-width:760px}
thead tr{border-bottom:1px solid var(--border)}
th{text-align:left;padding:10px 14px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--fg3);white-space:nowrap;background:var(--surface2)}
td{padding:11px 14px;border-bottom:1px solid var(--border);font-variant-numeric:tabular-nums;white-space:nowrap}
tr:last-child td{border-bottom:none}
tbody tr:hover{background:var(--surface2)}
td.campaign-name{font-weight:500;max-width:260px;overflow:hidden;text-overflow:ellipsis}
td.mono{font-family:var(--font-mono)}
.status-pill{display:inline-flex;align-items:center;padding:2px 8px;border-radius:100px;font-size:11px;font-weight:600}
.status-active{background:var(--good-bg);color:var(--good)}
.status-paused{background:var(--surface2);color:var(--fg3)}
.status-issue{background:var(--warn-bg);color:var(--warn)}
.status-crit{background:var(--crit-bg);color:var(--crit)}
.metric-warn{color:var(--warn);font-weight:600}
.metric-crit{color:var(--crit);font-weight:600}
.metric-good{color:var(--good);font-weight:600}

.issues-grid{display:flex;flex-direction:column;gap:8px;margin-bottom:24px}
.issue-row{background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--warn);border-radius:8px;padding:12px 16px;display:flex;align-items:flex-start;gap:10px}
.issue-row.crit{border-left-color:var(--crit)}
.issue-row.ok{border-left-color:var(--good)}
.issue-icon{font-size:14px;flex-shrink:0;margin-top:1px}
.issue-title{font-weight:600;font-size:13px;margin-bottom:2px}
.issue-detail{font-size:12px;color:var(--fg2)}

.rec-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:10px}
.rec-number{font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px}
.rec-title{font-weight:600;font-size:13px;margin-bottom:4px}
.rec-body{font-size:12px;color:var(--fg2);line-height:1.6}

.overview-bar{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}
.overview-name{font-size:16px;font-weight:700;letter-spacing:-.01em}
.overview-meta{font-size:12px;color:var(--fg3);margin-top:2px}
.overview-tags{display:flex;gap:6px;flex-wrap:wrap}
.divider{border:none;border-top:1px solid var(--border);margin:24px 0}

.all-accounts-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;margin-bottom:28px}
.account-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px;cursor:pointer;transition:border-color .15s,box-shadow .15s}
.account-card:hover{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-bg)}
.ac-header{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:14px}
.ac-name{font-weight:700;font-size:15px}
.ac-currency{font-size:11px;color:var(--fg3);font-family:var(--font-mono)}
.ac-metrics{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ac-m-label{font-size:10px;color:var(--fg3);text-transform:uppercase;letter-spacing:.07em;font-weight:600}
.ac-m-value{font-family:var(--font-mono);font-size:16px;font-weight:500;margin-top:1px;font-variant-numeric:tabular-nums}
.ac-issues{margin-top:12px;padding-top:12px;border-top:1px solid var(--border);display:flex;gap:6px;flex-wrap:wrap}
.issue-chip{padding:2px 8px;border-radius:4px;font-weight:600;font-size:10px;letter-spacing:.03em}
.chip-warn{background:var(--warn-bg);color:var(--warn)}
.chip-crit{background:var(--crit-bg);color:var(--crit)}
.chip-ok{background:var(--good-bg);color:var(--good)}

.cmp td:first-child{font-weight:600}
.footer{border-top:1px solid var(--border);padding:16px;text-align:center;font-size:11px;color:var(--fg3);font-family:var(--font-mono)}
@media (max-width:640px){.tabs-bar{top:0;position:relative}.header{position:relative}}
[hidden]{display:none!important}
button.account-card{font:inherit;text-align:left;color:inherit;width:100%}
.tab:focus-visible,.account-card:focus-visible,.period button:focus-visible,.row-link:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.row-link{background:none;padding:0;border:0;color:inherit;font:inherit;font-weight:600;cursor:pointer;text-align:left}
.ac-metrics>div,.kpi-card{min-width:0}.ac-m-value,.kpi-value,.kpi-sub,.issue-detail,.rec-body{overflow-wrap:anywhere}
.kpi-value.long{font-size:16px}.ac-m-value.long{font-size:13px}
.empty{color:var(--fg2);font-size:13px;margin:0 0 20px}
.issue-chip{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.print-only{display:none}
@media print{.main>[data-period],.main [data-panel]{display:block!important}.main [data-panel]:not([data-panel="overview"]),.main>[data-period="1"]{break-before:page}body{background:white}.header,.tabs-bar{position:static}.tabs-bar,.period{display:none}.main{padding:12px 0}.account-card,.kpi-card,.issue-row,.rec-card,tr{break-inside:avoid}.main>.tab-panel:not([hidden]){display:block}table{font-size:8.5pt;min-width:0}th,td{white-space:normal;padding:4px}.table-wrap{overflow:visible}.print-only{display:block}.footer{margin-top:12px}}
`;
