import { money, outcomes, planAmounts, signals, type PlanInputs, type Proposal, type Report, type Snapshot } from '../../lib/reports/model';
import type { MetaAccount } from '../../lib/meta/read';
import type { DailyPresentation } from '../../lib/reports/daily-document';
export type Entry = { account: MetaAccount; report?: Report; error?: string; plan?: Proposal; planError?: string };
export type Run = { mode: 'daily' | 'plan'; date: string; entries: Entry[]; inputs: PlanInputs; presentation?: DailyPresentation };
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
    <h3>{baseline.window.partial?'Month to date':'Last month'} at a glance</h3>
    <div className="rep-totals">{[['Spend',money(baseline.totals?.spend ?? null,currency)],['Purchases',n(baseline.totals?.purchases ?? null)],['Leads',n(baseline.totals?.leads ?? null)],['Purchase ROAS',multiple(baseline.totals?.roas ?? null)],['Reporting period cap',money(info.previousCap ?? null,currency)],['Spend against cap',pct(info.previousCap && baseline.totals?.spend != null ? 100 * baseline.totals.spend / info.previousCap : null)]].map(([label,value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
    {report.comparison && <section><h4>Previous period comparison</h4><p>{report.comparison.window.since} – {report.comparison.window.until} compared with {baseline.window.since} – {baseline.window.until}.</p>{report.comparison.totals ? <div className="rep-scroll"><table><thead><tr><th>Metric</th><th>Previous period</th><th>Planning baseline</th></tr></thead><tbody>{(['spend','leads','purchases','roas','ctr'] as const).map(key=>{
      const format=key==='spend'?(v:number|null)=>money(v,currency):key==='ctr'?pct:key==='roas'?multiple:n;
      return <tr key={key}><th>{{spend:'Spend',leads:'Leads',purchases:'Purchases',roas:'Purchase ROAS',ctr:'CTR'}[key]}</th><td>{format(report.comparison!.totals![key])}</td><td>{format(baseline.totals?.[key]??null)}</td></tr>;
    })}</tbody></table></div>:<p>Meta returned no comparison totals.</p>}</section>}
    {plan && <p>{plan.summary}</p>}<Campaigns period={baseline} currency={currency}/>
    <h4>Tracking evidence</h4>{tracking && <><p>Last seven days at retrieval · {tracking.since.slice(0,10)} – {tracking.checkedAt.slice(0,10)} UTC</p>{tracking.pixels === null ? <p>Dataset inventory unavailable to this connection.</p> : tracking.pixels.length ? <ul>{tracking.pixels.map((px,i) => <li key={i}>{px.name} · Last fired {px.lastFired || 'unreported'} · Event sources {px.sources === null ? 'unavailable' : px.sources.join(', ') || 'none returned'}</li>)}</ul> : <p>No datasets visible on this account connection.</p>}</>}
    {planError && <p role="alert">{planError}</p>}
    <h3>Top and low performers</h3>{plan ? bullets(plan.performance) : bullets(signals(baseline).map(f => f.finding))}
    <h3>Competitor analysis</h3>{plan && bullets(plan.competitors)}{report.competitorEvidence && <><p>{report.competitorEvidence.client} · Foreplay · {report.competitorEvidence.checkedAt.slice(0,10)} · {report.competitorEvidence.ads.length} records. {report.competitorEvidence.coverage}</p><ul>{report.competitorEvidence.ads.map(ad=><li key={ad.id}>{ad.advertiser} · {[ad.format,ad.cta].filter(Boolean).join(' · ')} {ad.text || 'Copy unavailable'} · {ad.url ? <a href={ad.url} target="_blank" rel="noreferrer">Record {ad.id}</a> : ad.id}{ad.transcript && <small>Video excerpt · {ad.transcript}</small>}</li>)}</ul></>}<p>{info.competitors || (report.competitorEvidence ? '' : 'No dated competitor observations supplied.')}</p>
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
    {monthly(run)}
  </article>;
}
