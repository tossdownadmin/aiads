import {reviewQuality,deliveryNotices,deduplicateFindings} from './review-quality';
import { campaignCards, detailStyles, galleryScript } from './detail-view';
import type { MetaAccount } from '../meta/read';
import { dailyWindows, shiftDay, validDay, type Report, type Snapshot } from './model';
import {dailyTable,isPlanningInputAction,planningInputTable} from './daily-tables';
import { dailyStyles } from './daily-style';
import { BRAND_ICON_DATA_URI } from '../ui/brand-icon';
import type { ReportFinding as PresentedFinding } from '../skills/report-types';
import type { ClientLayout, DailyTemplate, Exclusion } from './daily-template';
import { accountResult, cash, count, dailyFact, dailyFindings, dash, defaultLayout, percent, ratio, resultLabel, type Fact, type Tone } from './daily-metrics';

type Entry = { account: MetaAccount; report?: Report; error?: string };
type Priority = NonNullable<PresentedFinding['priority']>;
export type DailyPresentation = { layouts?: Record<string,ClientLayout>; exclusions?: Exclusion[]; template?: DailyTemplate; skill?: import('../skills/report-types').SkillVersion };
const escape = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const icon={crit:'🔴',warn:'⚠️',ok:'✓'};
const headerLogo='<div class="logo-mark"><img src="'+escape(BRAND_ICON_DATA_URI)+'" width="32" height="32" alt="Tossdown"></div>';
const day = (v: string,year=false) => new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',...(year?{year:'numeric' as const}:{}),timeZone:'UTC'}).format(new Date(v.slice(0,10)+'T00:00:00Z'));
const title = (v:string) => '<p class="section-label">'+escape(v)+'</p>';
const empty = (v:string) => '<p class="empty">'+escape(v)+'</p>';
const badge=(v:string,tone='blue')=>'<span class="badge badge-'+tone+'">'+escape(v)+'</span>';
const severity = {crit:0,warn:1,ok:2};
const priorityRank = {now:0,next:1,monitor:2};
const priorityLabels: Record<Priority,string> = {now:'Now — Review first',next:'Next — Plan the next step',monitor:'Monitor — Keep under review'};
const priorities: Priority[] = ['now','next','monitor'];
const priorityOf = (f:PresentedFinding): Priority => f.priority ?? ({crit:'now',warn:'next',ok:'monitor'} as const)[f.tone];
const interpretation = (f:PresentedFinding) => f.interpretation?.trim() || f.detail;
const compareText = (a:string,b:string) => a<b?-1:a>b?1:0;
const compareFindings = (a:PresentedFinding,b:PresentedFinding) => priorityRank[priorityOf(a)]-priorityRank[priorityOf(b)] || severity[a.tone]-severity[b.tone] || compareText(a.title,b.title) || compareText(a.action,b.action) || compareText(a.reason,b.reason) || compareText(a.detail,b.detail) || compareText(a.interpretation??'',b.interpretation??'') || compareText(JSON.stringify(a.evidence??[]),JSON.stringify(b.evidence??[]));
const coverage = '<p class="coverage-note">Coverage: reported Meta metrics, current settings and supplied ad copy. Images and videos are available for your review; this skill does not visually analyse them.</p>';
const categoryOf=(f:PresentedFinding)=>f.category??(f.tone==='ok'?'win':'concern');

function metricSource(item:Fact) {
  const source=item.source;
  if (!source) return escape(item.detail);
  return escape(item.detail)+'<details class="metric-source"><summary>Metric source</summary>'+escape((source.calculation==='cost_per_result'?'spend / ':'')+source.metric+' · '+source.scope+' · '+source.entityIds.join(', ')+' · '+source.window.since+' to '+source.window.until+' · '+source.currency)+'</details>';
}
function metricTable(items:Fact[]) {
  return dailyTable('metrics',items.map(item=>[escape(item.label),escape(item.value),metricSource(item)]));
}
function tile(item:Fact,style='') {
  return '<div class="kpi-card '+style+'"><div class="kpi-label">'+escape(item.label)+'</div><div class="kpi-value">'+escape(item.value)+'</div><div class="kpi-sub">'+metricSource(item)+'</div></div>';
}
function issue(tone: Tone,heading:string,detail:string) {
  return '<div class="issue-row '+tone+'"><div class="issue-icon" aria-hidden="true">'+icon[tone]+'</div><div><div class="issue-title">'+escape(heading)+'</div><div class="issue-detail">'+escape(detail)+'</div></div></div>';
}
function supportingEvidence(f:PresentedFinding) {
  const evidence=[...new Set((f.evidence??[]).filter(item=>item.trim()))];
  if (!evidence.length) return '';
  const items=(values:string[])=>'<ul>'+values.map(value=>'<li>'+escape(value)+'</li>').join('')+'</ul>';
  return '<div class="finding-evidence"><p class="evidence-label">Measured support</p>'+items(evidence.slice(0,2))+
    (evidence.length>2?'<details class="evidence-more"><summary>More supporting evidence ('+(evidence.length-2)+')</summary>'+items(evidence.slice(2))+'</details>':'')+'</div>';
}
function findingCard(f:PresentedFinding,accountName?:string) {
  return '<article class="issue-row '+f.tone+'"><div class="issue-icon" aria-hidden="true">'+icon[f.tone]+'</div><div class="finding-content">'+
    (accountName?'<p class="finding-account">'+escape(accountName)+'</p>':'')+'<h3 class="issue-title">'+escape(f.title)+'</h3><p class="issue-detail">'+escape(interpretation(f))+'</p>'+supportingEvidence(f)+'</div></article>';
}
function findingSection(label:string,findings:PresentedFinding[],fallback:string) {
  return '<section class="finding-section" aria-label="'+escape(label)+'">'+title(label)+'<div class="issues-grid">'+(findings.map(f=>findingCard(f)).join('')||empty(fallback))+'</div></section>';
}
function dataNotes(p:Snapshot) {
  return [...new Set([...p.notes,...p.reviewNotes??[],...p.analysis?.notes??[]].filter(note=>note.trim()))];
}
function availability(p:Snapshot,findings:PresentedFinding[]=[]) {
  const notes=dataNotes(p);
  return '<section class="availability-section" aria-label="Data availability and review limits">'+title('Data availability & review limits')+coverage+
    (notes.length?'<ul class="review-notes">'+notes.map(note=>'<li>'+escape(note)+'</li>').join('')+'</ul>':empty('No additional data-availability notes were supplied.'))+
    findings.filter(f=>categoryOf(f)==='data_gap'||categoryOf(f)==='observation').map(f=>findingCard(f)).join('')+'</section>';
}
function campaignPreview(p: Snapshot, currency: string, scope: string) {
  return campaignCards(p.campaigns.map(c=>({...c,stats:c})),p.details,currency,scope);
}
function accountView(entry: Entry,p:Snapshot,layout:ClientLayout|undefined,i:number) {
  const account=entry.account, name=layout?.name||account.name, market=layout?.market||account.timezone||'';
  const spec=layout?.periods?.[i]||defaultLayout(p,layout?.type);
  const findings:PresentedFinding[]=deduplicateFindings(p.analysis?.findings ?? dailyFindings(account,p));
  const quality=reviewQuality(account,{...p,analysis:{...p.analysis,findings}},entry.report?.reviewContext);
  const notices=deliveryNotices(account,p);
  const tone:Tone=findings.some(f=>f.tone==='crit')?'crit':findings.some(f=>f.tone==='warn')?'warn':'ok';
  const fact=(label:string)=>dailyFact(label,account,p,layout,spec.columns,findings,spec.scopes?.[label],i);
  const type=layout?.type||({SALES:'Sales',LEADS:'Lead Gen',VISITS:'Profile Visits',MIXED:'Mixed objectives',MIXROAS:'Sales + Engagement'}[spec.columns]);
  const summary=accountResult(p,spec.columns,type);
  const ref=spec.summary || [];
  const defaultScope=spec.scopes?.[summary.kind==='purchases'?'Purchases':'Leads'] || (spec.kpis.includes('IG Growth CPR')?'IG growth':'');
  const resultMetric=summary.kind==='purchases'?'Purchases':summary.kind==='leads'?'Leads':summary.kind==='instagramVisits'?'IG Growth Results':'';
  const costMetric=summary.kind==='purchases'?'CPP':summary.kind==='leads'?'CPL':summary.kind==='instagramVisits'?'IG Growth CPR':'';
  const scoped=(label:string, hint:string|undefined)=>dailyFact(label,account,p,layout,spec.columns,findings,hint,i);
  const resultScope=ref[0] || defaultScope, costScope=ref[1] || ref[0] || (summary.kind==='instagramVisits'?defaultScope:'');
  const summaryResult=resultMetric && resultScope ? scoped(resultMetric,resultScope) : { value:count(summary.value),detail:summary.scope };
  const summaryCost=costMetric && costScope ? scoped(costMetric,costScope) : { value:cash(summary.cost,account.currency),detail:summary.scope };
  const compare=(label:string,idx:number)=>ref[idx]==='best'?fact('Best '+label):scoped(label,ref[idx] || (label==='ROAS'?spec.scopes?.ROAS:undefined));
  return {account,p,spec,name,market,type,findings,quality,notices,tone,fact,summary,summaryResult,summaryCost,comparison:[compare('ROAS',2),compare('CTR',3),compare('Freq',4)]};
}
type View = ReturnType<typeof accountView>;
type QueuedAction = { view:View; finding:PresentedFinding; accountIndex:number };
function actionQueue(views:View[]) {
  const sorted:QueuedAction[]=views.flatMap((view,accountIndex)=>view.findings.filter(f=>f.action.trim()).map(finding=>({view,finding,accountIndex})));
  sorted.sort((a,b)=>priorityRank[priorityOf(a.finding)]-priorityRank[priorityOf(b.finding)] || severity[a.finding.tone]-severity[b.finding.tone] ||
    compareText(a.view.name,b.view.name) || compareText(a.view.account.id,b.view.account.id) || compareFindings(a.finding,b.finding));
  const seen=new Set<string>();
  return sorted.filter(item=>{
    const key=JSON.stringify([item.view.account.id,item.finding.action]);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
function prioritizedActions(views:View[],portfolio=false) {
  const all=actionQueue(views);
  const fullQueue=all.filter(item=>!isPlanningInputAction(item.finding.action));
  const queue=portfolio?fullQueue.slice(0,10):fullQueue;
  const kind=portfolio?'portfolio-actions':'actions';
  const row=({view,finding:f,accountIndex}:QueuedAction,planning=false)=>{
    const cells=[
      planning?'Optional setup':'<span class="issue-chip chip-'+f.tone+'">'+escape({crit:'Critical concern',warn:'Review concern',ok:'Follow-up'}[f.tone])+'</span>',
      '<h4 class="rec-title">'+escape(f.action)+'</h4><p class="rec-body">'+escape(f.reason)+'</p>',
      supportingEvidence(f)||'—',
    ];
    if(portfolio)cells.unshift('<button type="button" class="row-link action-account" data-open="'+accountIndex+'">'+escape(view.name)+'</button>');
    return cells;
  };
  const planning=all.filter(item=>isPlanningInputAction(item.finding.action)).map(item=>row(item,true));
  return '<section class="actions-section" aria-label="'+(portfolio?'Portfolio action queue':'Prioritized actions')+'">'+title(portfolio?'Portfolio action queue':'Prioritized actions')+
    '<p class="section-intro">'+(portfolio?'Actions from each account’s findings, ordered by priority, then concern severity. This is a work queue, not a comparative performance ranking.':'Suggested follow-ups, ordered by priority, then concern severity. Review the evidence before making changes.')+'</p>'+
    (portfolio&&fullQueue.length>queue.length?'<p class="section-intro">Showing '+queue.length+' of '+fullQueue.length+' proposed actions. Open an account for its complete action list.</p>':'')+(queue.length?priorities.map(priority=>{
      const group=queue.filter(item=>priorityOf(item.finding)===priority);
      if (!group.length) return '';
      const rows=group.map(item=>row(item));
      return '<div class="priority-group priority-'+priority+'"><h3 class="priority-heading">'+escape(priorityLabels[priority])+'</h3>'+dailyTable(portfolio?'portfolio-actions':'actions',rows)+'</div>';
    }).join(''):empty('No performance or delivery actions for this period.'))+planningInputTable(kind,planning)+'</section>';
}
function periodComparison(p:Snapshot,currency:string) {
  const previous=p.previous;
  if (!previous) return '';
  const days=(window:Snapshot['window'])=>validDay(window.since)&&validDay(window.until)?Math.round((Date.parse(window.until)-Date.parse(window.since))/86400000)+1:0;
  const currentDays=days(p.window),previousDays=days(previous.window);
  if (currentDays<=0 || previousDays<=0) return '';
  const comparable=currentDays===previousDays && previous.window.until<p.window.since;
  const range=(window:Snapshot['window'])=>day(window.since,true)+' – '+day(window.until,true);
  const core={spend:'Spend',leads:'Leads',purchases:'Purchases',ctr:'CTR',cpc:'CPC',roas:'ROAS'};
  const outcomes={websiteAddsToCart:'Website adds to cart',websiteCheckouts:'Website checkouts initiated',websitePurchases:'Website purchases',formLeads:'Instant-form leads',websiteLeads:'Website leads',conversionLeads:'Converted leads',instagramVisits:'Instagram profile visits',facebookVisits:'Facebook Page visits',thruplays:'ThruPlays',conversations:'Conversations'};
  const labels={...core,...outcomes};
  type Metric = keyof typeof labels;
  const format=(key:Metric,value:number|null|undefined)=>key==='spend'||key==='cpc'?cash(value,currency):key==='ctr'?percent(value):key==='roas'?ratio(value):count(value);
  const rows=(Object.keys(labels) as Metric[]).filter(key=>key in core || p.totals?.[key]!=null || previous.totals?.[key]!=null).map(key=>{
    const current=p.totals?.[key],prior=previous.totals?.[key];
    let change=dash;
    if (comparable && current!=null && prior!=null) {
      const delta=current-prior;
      change=delta===0?'No change':(delta>0?'+':'−')+(key==='ctr'?Math.abs(delta).toFixed(2)+' pp':format(key,Math.abs(delta)));
    }
    return '<tr><th scope="row">'+labels[key]+'</th><td>'+escape(format(key,current))+'</td><td>'+escape(format(key,prior))+'</td><td>'+escape(change)+'</td></tr>';
  }).join('');
  return '<section class="comparison-section" aria-label="Period comparison">'+title('Period comparison')+
    '<p class="section-intro">'+(comparable?'Two separate '+currentDays+'-day windows. Changes describe the reported metrics; direction alone does not show whether a target was met.':'Changes are unavailable because these windows overlap or differ in length.')+'</p>'+
    '<div class="table-wrap"><table class="period-comparison"><thead><tr><th scope="col">Metric</th><th scope="col">Current<span class="table-period">'+escape(range(p.window))+'</span></th><th scope="col">Previous<span class="table-period">'+escape(range(previous.window))+'</span></th><th scope="col">Change</th></tr></thead><tbody>'+rows+'</tbody></table></div></section>';
}
function budgetPacing(p:Snapshot,currency:string) {
  const pacing=p.pacing;
  if (!pacing) return '';
  return '<section class="pacing-section" aria-label="Monthly budget pacing">'+title('Monthly budget pacing — '+pacing.month)+
    '<p class="section-intro">Month-to-date coverage: '+escape(pacing.elapsedDays)+' of '+escape(pacing.monthDays)+' days. The month-end projection is an estimate.</p>'+metricTable([
      {label:'Monthly budget',value:cash(pacing.budget,currency),detail:'Supplied budget'},
      {label:'Spent to date',value:cash(pacing.spent,currency),detail:'Month-to-date spend'},
      {label:'Expected spend to date',value:cash(pacing.expectedSpend,currency),detail:'Supplied pacing benchmark'},
      {label:'Projected month-end spend',value:cash(pacing.projectedSpend,currency),detail:'Estimated full-month spend'},
    ])+'</section>';
}
function clientCard(v:View,index:number) {
  return '<button type="button" class="account-card" data-open="'+index+'"><span class="ac-header"><span><span class="ac-name" style="display:block">'+escape(v.name)+'</span><span class="ac-currency">'+escape([v.account.currency,v.market].filter(Boolean).join(' · '))+'</span></span>'+badge(v.type)+'</span><span class="ac-metrics">'+v.spec.cards.map(label=>{
    const k=v.fact(label);
    return '<span title="'+escape(k.detail)+'"><span class="ac-m-label" style="display:block">'+escape(label)+'</span><span class="ac-m-value'+(k.value.length>15?' long':'')+'" style="display:block">'+escape(k.value)+'</span></span>';
  }).join('')+'</span><span class="ac-issues">'+v.findings.slice(0,2).map(f=>'<span class="issue-chip chip-'+f.tone+'" title="'+escape(f.title)+'">'+icon[f.tone]+' '+escape(f.title.split(' · ')[0])+'</span>').join('')+'</span></button>';
}
function detail(v:View,periodName:string) {
  const active=v.p.inventory?.active;
  const wins=v.findings.filter(f=>categoryOf(f)==='win'),concerns=v.findings.filter(f=>categoryOf(f)==='concern').sort((a,b)=>severity[a.tone]-severity[b.tone] || compareFindings(a,b));
  return '<div class="overview-bar"><div><div class="overview-name">'+escape(v.name)+'</div><div class="overview-meta">'+escape(['Account '+v.account.id.replace(/^act_/,''),v.account.currency,v.market].filter(Boolean).join(' · '))+'</div></div><div class="overview-tags">'+(active!=null?badge(active+' Active','green'):'')+badge(v.type)+'</div></div>'+
    (v.p.analysis?.notes?.length?'<div class="review-limited" role="note">'+issue('warn','AI review with limitations',v.p.analysis.notes.join(' '))+'</div>':'')+
    '<section class="coverage-ledger" aria-label="Review coverage">'+title('Review coverage — '+v.quality.status)+'<p>Processing completion and performance assessment are separate. '+escape(v.quality.performanceFindings)+' performance findings retained.</p><ul>'+v.quality.checks.map(c=>'<li>'+escape(c.label)+': '+escape(c.status.replace('_',' '))+'</li>').join('')+'</ul></section>'+
    (v.notices.length?'<section aria-label="Current delivery notices">'+title('Current delivery notices')+v.notices.map(n=>issue('warn',n.title,n.detail)).join('')+'</section>':'')+
    title(periodName+' — KPIs')+metricTable(v.spec.kpis.map(label=>v.fact(label)))+
    '<div class="findings-columns">'+findingSection('Wins',wins,'No positive findings were supplied for this period.')+findingSection('Concerns',concerns,'No performance concerns were flagged in the supplied findings.')+'</div>'+
    prioritizedActions([v])+periodComparison(v.p,v.account.currency)+budgetPacing(v.p,v.account.currency)+availability(v.p,v.findings)+
    title('Campaign Performance — '+periodName)+campaignPreview(v.p,v.account.currency,v.account.id+'-'+v.p.window.since+'-'+v.p.window.until);
}
function overview(views:View[],exclusions:Exclusion[],periodName:string) {
  const currencies=[...new Set(views.map(v=>v.account.currency))].sort((a,b)=>{
    const rank=(s:string)=>['CAD','USD','PKR'].includes(s)?['CAD','USD','PKR'].indexOf(s):3;
    return rank(a)-rank(b)||a.localeCompare(b);
  });
  const groups=currencies.map(currency=>{
    const members=views.filter(v=>v.account.currency===currency), values=members.flatMap(v=>v.p.totals?.spend!=null?[v.p.totals.spend]:[]);
    const sum=cash(values.length?values.reduce((a,b)=>a+b,0):null,currency);
    const rows=members.map(v=>{
      const t=v.p.totals,r=v.summary, ix=views.indexOf(v);
      const value=v.summaryResult.value!==dash && r.kind?v.summaryResult.value+' '+resultLabel(r.kind):dash;
      return '<tr data-open="'+ix+'" style="cursor:pointer"><td><button class="row-link" data-open="'+ix+'">'+escape(v.name)+'</button></td><td>'+escape(cash(t?.spend,currency))+'</td><td title="'+escape(v.summaryResult.detail)+'">'+escape(value)+'</td><td title="'+escape(v.summaryCost.detail)+'">'+escape(v.summaryCost.value)+'</td>'+v.comparison.map(f=>'<td title="'+escape(f.detail)+'">'+escape(f.value)+'</td>').join('')+'</tr>';
    }).join('');
    return {kpi:tile({label:currency+' Spend',value:sum,detail:values.length+' of '+members.length+' accounts reporting spend'},'highlight'),rows:'<tr><td colspan="7" class="group-heading">'+escape(currency+' accounts · '+sum+' total')+'</td></tr>'+rows};
  });
  const flags=views.flatMap(v=>v.findings.filter(f=>f.tone==='crit'));
  const warnings=views.reduce((n,v)=>n+v.findings.filter(f=>f.tone==='warn').length,0);
  const findings=views.flatMap(v=>v.findings.map(f=>({view:v,finding:f}))).sort((a,b)=>severity[a.finding.tone]-severity[b.finding.tone] || compareText(a.view.name,b.view.name) || compareText(a.view.account.id,b.view.account.id) || compareFindings(a.finding,b.finding));
  const summarySection=(label:string,positive:boolean)=>'<section class="finding-section" aria-label="'+label+'">'+title(label)+'<div class="issues-grid">'+
    (findings.filter(item=>categoryOf(item.finding)===(positive?'win':'concern')).slice(0,6).map(({view,finding})=>findingCard(finding,view.name)).join('')||empty(positive?'No positive findings were supplied for this period.':'No performance concerns were flagged in the supplied findings.'))+'</div><p class="section-intro">Open an account to read all of its findings.</p></section>';
  const groupedNotes=new Map<string,string[]>();
  for(const v of views)for(const note of dataNotes(v.p))groupedNotes.set(note,[...groupedNotes.get(note)??[],v.name]);
  const notes=[...groupedNotes].map(([note,names])=>'<li>'+escape(note)+' <strong>'+escape(names.length===views.length?'All accounts':names.join(', '))+'</strong></li>');
  return title('All Accounts — '+periodName)+'<section class="coverage-ledger" aria-label="Portfolio review coverage"><p>'+views.length+' accounts processed · '+views.filter(v=>v.quality.status==='reviewed').length+' assessed with complete checks · '+views.filter(v=>v.quality.status==='limited').length+' limited · '+views.filter(v=>v.quality.status==='unavailable').length+' without dated delivery/spend evidence.</p></section>'+'<div class="kpi-grid">'+groups.map(g=>g.kpi).join('')+
    tile({label:'Critical Flags',value:String(flags.length),detail:'Across all accounts'},'crit')+tile({label:'Warnings',value:String(warnings),detail:'Across all accounts'})+
    tile({label:'Accounts',value:String(views.length),detail:exclusions.length+' outside this report'})+'</div><hr class="divider">'+title('Account performance — '+periodName)+
    '<div class="table-wrap"><table class="cmp" aria-label="Account performance"><thead><tr>'+['Account','Spend','Results','Cost / Result','ROAS','CTR','Frequency'].map(v=>'<th scope="col">'+v+'</th>').join('')+'</tr></thead><tbody>'+groups.map(g=>g.rows).join('')+'</tbody></table></div>'+
    (views.length?'<details class="account-breakdowns"><summary>Account highlights and custom KPIs</summary><div class="all-accounts-grid">'+views.map(clientCard).join('')+'</div></details>':'')+
    prioritizedActions(views,true)+'<div class="findings-columns">'+summarySection('Wins',true)+summarySection('Concerns',false)+'</div>'+
    '<section class="availability-section" aria-label="Data availability and review limits">'+title('Data availability & review limits')+coverage+(notes.length?'<ul class="review-notes">'+notes.join('')+'</ul>':empty('No additional data-availability notes were supplied.'))+'</section>'+
    title('Not in this report ('+exclusions.length+' brands)')+'<div class="issues-grid">'+(exclusions.map(e=>issue('warn',e.name,e.reason)).join('')||empty('All expected accounts are included.'))+'</div>';
}
// This script is identical for every report. All source text is escaped in the HTML.
const controls = `
(function () {
  var activeWindow = 0;
  var activeAccount = 'overview';
  function elements(selector) { return Array.from(document.querySelectorAll(selector)); }
  function render() {
    elements('[data-period]').forEach(function (el) { el.hidden = el.dataset.period !== String(activeWindow); });
    elements('[data-panel]').forEach(function (el) { el.hidden = el.dataset.panel !== activeAccount; });
    elements('button[data-window]').forEach(function (button) {
      var active = button.dataset.window === String(activeWindow);
      button.classList.toggle('on', active);
      button.setAttribute('aria-pressed', String(active));
    });
    elements('button.tab').forEach(function (button) {
      var active = button.dataset.open === activeAccount;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  function readHash() {
    var tab = elements('button.tab[data-key]').find(function (button) { return '#' + button.dataset.key === location.hash; });
    activeAccount = tab ? tab.dataset.open : 'overview';
    render();
  }
  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-window],[data-open]');
    if (!button) return;
    if (button.hasAttribute('data-window')) activeWindow = Number(button.dataset.window);
    else {
      activeAccount = button.dataset.open;
      var selected = elements('button.tab[data-key]').find(function (item) { return item.dataset.open === activeAccount; });
      if (window === window.top && selected) {
        try { history.replaceState(null, '', '#' + selected.dataset.key); } catch (e) { /* Local files can restrict history. */ }
      }
    }
    render();
    window.scrollTo(0, 0);
  });
  document.addEventListener('keydown', function (event) {
    var tabs = event.target.closest('.tabs,.period');
    if (!tabs || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    var buttons = Array.from(tabs.querySelectorAll('button'));
    var pos = buttons.indexOf(event.target);
    if (pos === -1) return;
    event.preventDefault();
    var next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (pos + (event.key === 'ArrowLeft' ? -1 : 1) + buttons.length) % buttons.length;
    buttons[next].focus();
    buttons[next].click();
  });
  window.addEventListener('hashchange', readHash);
  window.addEventListener('message', function (event) {
    if (event.source === parent && event.data === 'print-daily-report') window.print();
  });
  var printEvidence = [];
  window.addEventListener('beforeprint', function () {
    elements('details.evidence-more').forEach(function (details) {
      if (!details.open) { printEvidence.push(details); details.open = true; }
    });
  });
  window.addEventListener('afterprint', function () {
    printEvidence.forEach(function (details) { details.open = false; });
    printEvidence = [];
  });
  readHash();
})();`;

export function renderDailyDocument(entries:Entry[],end:string,presentation:DailyPresentation={}) {
  const generated=entries.find(e=>e.report)?.report?.generated || new Date().toISOString();
  const windows=dailyWindows(end,shiftDay(end,1)), names=['Last 7 Days','Last 30 Days'];
  const ranges=windows.map(w=>day(w.since,w.since.slice(0,4)!==w.until.slice(0,4))+' – '+day(w.until,true));
  const templateJson=presentation.template ? JSON.stringify(presentation.template).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026') : '';
  const embeddedTemplate=templateJson ? '<script type="application/json" id="tossdown-daily-template">'+templateJson+'</script>' : '';
  const exclusions=[...presentation.exclusions??[],...entries.filter(e=>!e.report).map(e=>({name:presentation.layouts?.[e.account.id]?.name??e.account.name,reason:e.error||'Meta did not return a report.'}))];
  const valid=entries.filter(e=>e.report?.periods.length===2);
  const periods=windows.map((_,i)=>valid.map(e=>accountView(e,e.report!.periods[i],presentation.layouts?.[e.account.id],i)));
  const both=(fn:(i:number)=>string)=>periods.map((_,i)=>'<div data-period="'+i+'"'+(i?' hidden':'')+'>'+fn(i)+'</div>').join('');
  return '<!doctype html><html lang="en" data-report-layout="tables-v2"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" type="image/png" href="'+escape(BRAND_ICON_DATA_URI)+'"><title>Meta Ads — Daily Report</title><style>'+dailyStyles+detailStyles+'.group-heading{background:var(--surface2);font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}</style></head><body>'+
    '<header class="header"><div class="header-inner"><div class="logo-area">'+headerLogo+'<div><h1 class="header-title">Meta Ads — Daily Report</h1><div class="header-subtitle">'+both(i=>escape(names[i]+' · '+ranges[i]))+'</div></div></div><div class="header-meta"><div class="period" role="group" aria-label="Date range"><button data-window="0" class="on" aria-pressed="true">Last 7 days</button><button data-window="1" aria-pressed="false">Last 30 days</button></div>'+badge(valid.length+' Accounts')+badge('Generated '+day(generated,true),'green')+'</div></div></header>'+
    '<div class="tabs-bar">'+both(i=>'<nav class="tabs" aria-label="Report accounts"><button class="tab active" data-key="overview" data-open="overview">Overview</button>'+periods[i].map((v,n)=>'<button class="tab" data-key="'+escape(v.account.id)+'" data-open="'+n+'">'+escape(v.name)+(v.tone==='ok'?'':'<span class="flag-dot '+v.tone+'"></span>')+'</button>').join('')+'</nav>')+'</div>'+
    '<main class="main">'+both(i=>'<h2 class="print-only">'+escape(names[i]+' · '+ranges[i])+'</h2><section class="tab-panel" data-panel="overview">'+overview(periods[i],exclusions,names[i])+'</section>'+periods[i].map((v,n)=>'<section class="tab-panel" data-panel="'+n+'" hidden>'+detail(v,names[i])+'</section>').join(''))+'</main>'+
    '<footer class="footer">'+both(i=>escape('Generated by Tossdown · '+day(generated,true)+' · Meta Ads API'+(presentation.skill?' · Skill '+presentation.skill.name+' '+presentation.skill.sha.slice(0,8):'')+' · '+names[i]+' ('+ranges[i]+') · Spend grouped by currency. Status and bid settings at retrieval. A dash marks an unreported metric.'))+'</footer>'+embeddedTemplate+'<script>'+controls+'\n'+galleryScript+'</script></body></html>';
}

