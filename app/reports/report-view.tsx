import { money, outcomes, planAmounts, signals, type PlanInputs, type Proposal, type Report, type Snapshot } from '../../lib/reports/model';
import type { MetaAccount } from '../../lib/meta/read';
export type Entry = { account: MetaAccount; report?: Report; error?: string; plan?: Proposal; planError?: string };
export type Run = { mode: 'daily' | 'plan'; date: string; entries: Entry[]; inputs: PlanInputs };
const n = (v: number | null) => v === null ? '—' : v.toLocaleString('en', { maximumFractionDigits: 2 });
const pct = (v: number | null) => v === null ? '—' : n(v) + '%';
const multiple = (v: number | null) => v === null ? '—' : n(v) + '×';
const statusNames: Record<number,string> = { 1: 'Active', 2: 'Disabled', 3: 'Unsettled', 7: 'Pending risk review', 8: 'Pending settlement', 9: 'In grace period', 100: 'Pending closure', 101: 'Closed' };
function Campaigns({ period, currency }: { period: Snapshot; currency: string }) {
  return <><p className="rep-range">{period.window.since} – {period.window.until} · Meta account time zone{period.window.partial && ' · Partial baseline month'}</p>
    {period.notes.map(t => <p key={t}>{t}</p>)}
    {period.campaigns.length > 0 && <div className="rep-scroll"><table><thead><tr><th>Campaign</th><th>Status today</th><th>Spend</th><th>Impr.</th><th>Reach</th><th>Freq.</th><th>CTR</th><th>CPC</th><th>Reported actions / cost per action</th><th>Purchase ROAS</th></tr></thead>
    <tbody>{period.campaigns.map(c => <tr key={c.id}><th>{c.name}<small>{c.objective.replace(/^OUTCOME_/, '')} · {c.id}</small>{c.settings?.goals.length ? <small>Current goals · {c.settings.goals.join(", ")}</small> : null}{c.settings?.bids.length ? <small>Current bids · {c.settings.bids.join(", ")}</small> : null}{c.stop && <small>Scheduled end {c.stop}</small>}</th><td>{c.status}{!c.hasInsights && <small>No insight row</small>}</td><td>{money(c.spend,currency)}</td><td>{n(c.impressions)}</td><td>{n(c.reach)}</td><td>{n(c.frequency)}</td><td>{pct(c.ctr)}</td><td>{money(c.cpc,currency)}</td><td>{outcomes(c).length ? outcomes(c).map(([label,count]) => <small key={label}>{label} {n(count)}{count > 0 && c.spend !== null && ' · ' + money(c.spend / count,currency) + ' each'}</small>) : '—'}</td><td>{multiple(c.roas)}</td></tr>)}</tbody></table></div>}
  </>;
}
function bullets(items: string[]) { return <ul>{items.map((t,i) => <li key={i}>{t}</li>)}</ul>; }
function daily(entries: Entry[], i: number) {
  const totals = new Map<string,number>();
  for (const e of entries) {
    const amount = e.report?.periods[i]?.totals?.spend;
    if (typeof amount === 'number') totals.set(e.account.currency, (totals.get(e.account.currency) ?? 0) + amount);
  }
  return <><h3>{i ? '30' : '7'}-day overview</h3><div className="rep-totals">{[...totals].map(([key,value]) => <div key={key}><small>Reported spend · {key}</small><strong>{money(value,key)}</strong></div>)}</div>
    <div className="rep-scroll"><table><thead><tr><th>Account</th><th>Spend</th><th>Purchases</th><th>Leads</th><th>Purchase ROAS</th><th>CTR</th><th>Freq.</th></tr></thead><tbody>{entries.map(e => {const t=e.report?.periods[i]?.totals;return <tr key={e.account.id}><th>{e.account.name}<small>{e.account.currency}</small></th><td>{money(t?.spend ?? null,e.account.currency)}</td><td>{n(t?.purchases ?? null)}</td><td>{n(t?.leads ?? null)}</td><td>{multiple(t?.roas ?? null)}</td><td>{pct(t?.ctr ?? null)}</td><td>{n(t?.frequency ?? null)}</td></tr>;})}</tbody></table></div>
    <h3>Account detail</h3>{entries.map(e => {const snapshot = e.report?.periods[i]; const flags = snapshot ? signals(snapshot) : [];return <details className="rep-detail" key={e.account.id}><summary>{e.account.name}<span>{e.error ? 'Unavailable' : snapshot?.campaigns.length + ' campaigns'}</span></summary>
      {e.error && <p>{e.error}</p>}{snapshot && <><p>{e.account.id} · {e.account.currency} · {e.account.timezone} · {statusNames[e.account.status] || 'Status ' + e.account.status}</p><Campaigns period={snapshot} currency={e.account.currency}/><h4>Findings and next actions</h4>{flags.length ? bullets(flags.map(f => f.finding + ' ' + f.action)) : <p>No delivery or missing-outcome flags in these checks.</p>}</>}</details>;})}
    <p className="rep-footnote">A dash marks an unreported value. Spend totals include only accounts with a reported total. Reach and frequency come directly from Meta at the stated level. Actions use Meta attribution and can overlap across types.</p></>;
}
function monthly(run: Run) {
  const entry = run.entries[0];
  if (!entry?.report) return <p>{entry?.error || 'No report returned.'}</p>;
  const { report, plan, planError } = entry;
  const baseline = report.periods[0];
  const currency = report.account.currency;
  const info = run.inputs;
  const { tracking } = report;
  const values = plan && info.cap ? planAmounts(plan.allocation, info.cap, currency) : [];
  const names = new Map(baseline.campaigns.map(c => [c.id,c.name]));
  return <>
    <p>{report.account.name} · {report.account.id} · {currency} · {report.account.timezone} · Account {statusNames[report.account.status] || report.account.status}</p>
    <h3>Last month at a glance</h3>
    <div className="rep-totals">{[['Spend',money(baseline.totals?.spend ?? null,currency)],['Purchases',n(baseline.totals?.purchases ?? null)],['Leads',n(baseline.totals?.leads ?? null)],['Purchase ROAS',multiple(baseline.totals?.roas ?? null)],['Reporting period cap',money(info.previousCap ?? null,currency)],['Spend against cap',pct(info.previousCap && baseline.totals?.spend != null ? 100 * baseline.totals.spend / info.previousCap : null)]].map(([label,value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
    {plan && <p>{plan.summary}</p>}<Campaigns period={baseline} currency={currency}/>
    <h4>Tracking evidence</h4>{tracking && <><p>Last seven days at retrieval · {tracking.since.slice(0,10)} – {tracking.checkedAt.slice(0,10)} UTC</p>{tracking.pixels === null ? <p>Dataset inventory unavailable to this connection.</p> : tracking.pixels.length ? <ul>{tracking.pixels.map((px,i) => <li key={i}>{px.name} · Last fired {px.lastFired || 'unreported'} · Event sources {px.sources === null ? 'unavailable' : px.sources.join(', ') || 'none returned'}</li>)}</ul> : <p>No datasets visible on this account connection.</p>}</>}
    {planError && <p role="alert">{planError}</p>}
    <h3>Top and low performers</h3>{plan ? bullets(plan.performance) : bullets(signals(baseline).map(f => f.finding))}
    <h3>Competitor analysis</h3>{plan && bullets(plan.competitors)}{report.competitorEvidence && <><p>{report.competitorEvidence.client} · Foreplay · {report.competitorEvidence.checkedAt.slice(0,10)} · {report.competitorEvidence.ads.length} records. {report.competitorEvidence.coverage}</p><ul>{report.competitorEvidence.ads.map(ad=><li key={ad.id}>{ad.advertiser} · {ad.text || 'Copy unavailable'} · {ad.url ? <a href={ad.url} target="_blank" rel="noreferrer">Record {ad.id}</a> : ad.id}</li>)}</ul></>}<p>{info.competitors || (report.competitorEvidence ? '' : 'No dated competitor observations supplied.')}</p>
    <h3>Market event</h3>{plan && <p>{plan.event}</p>}<p>{info.event || 'No dated market event supplied.'}</p>
    <h3>Budget and campaign plan</h3><p>Plan month cap · {money(info.cap ?? null,currency)}</p>{info.brief && <p>Client brief · {info.brief}</p>}
    {plan && <p>{plan.financialReview}</p>}{plan?.allocation.length ? <div className="rep-scroll"><table><thead><tr><th>Existing campaign</th><th>Proposed share</th><th>Budget</th><th>Reason</th></tr></thead><tbody>{plan.allocation.map((a,i) => <tr key={a.campaignId}><th>{names.get(a.campaignId)}</th><td>{a.percent}%</td><td>{money(values[i] ?? null,currency)}</td><td>{a.rationale}</td></tr>)}</tbody></table></div> : <p>No budget allocation proposed.</p>}
    <h3>New ads for existing campaigns</h3>{plan?.concepts.length ? plan.concepts.map((ad,i) => <section className="rep-concept" key={i}><h4>{ad.concept}</h4><small>{names.get(ad.campaignId)} · {ad.format}</small><p>{ad.visual}</p><p>{ad.copy}</p></section>) : <p>No creative draft available.</p>}
    <h3>Takeaways and gaps</h3>{plan && <>{bullets(plan.takeaways)}{bullets(plan.gaps)}</>}
    <p className="rep-footnote">Source · Meta Marketing API. Budget allocations and creative concepts are planning proposals. Client inputs are shown as supplied.</p>
  </>;
}
export default function ReportView({run}:{run:Run}) {
  const first = run.entries.find(e => e.report)?.report;
  return <article className="report-paper"><header><small>Tossdown Ads Intelligence</small><h2>{run.mode === 'daily' ? 'Daily account report' : 'Next-month ad plan'}</h2>
    <p>{run.mode === 'daily' ? 'Through ' : 'Plan month '}{run.date}{first && ' · Retrieved ' + first.generated.slice(0,16).replace('T',' ') + ' UTC'}</p></header>
    {run.mode === 'daily' ? <><p>{run.entries.filter(e => e.report).length} of {run.entries.length} selected accounts returned reports.</p><div className="rep-periods">
      <input type="radio" name="report-window" id="window-week" defaultChecked/><label htmlFor="window-week">Last 7 days</label><input type="radio" name="report-window" id="window-month"/><label htmlFor="window-month">Last 30 days</label>
      <section className="rep-seven">{daily(run.entries,0)}</section><section className="rep-thirty">{daily(run.entries,1)}</section></div></> : monthly(run)}
  </article>;
}
