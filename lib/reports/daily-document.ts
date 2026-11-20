import { campaignCards, detailStyles, galleryScript } from './detail-view';
import type { MetaAccount } from '../meta/read';
import { dailyWindows, shiftDay, type Report, type Snapshot } from './model';
import { dailyStyles } from './daily-style';
import type { ClientLayout, DailyTemplate, Exclusion } from './daily-template';
import { accountResult, cash, count, dailyFact, dailyFindings, dash, defaultLayout, resultLabel, type Fact, type Tone } from './daily-metrics';

type Entry = { account: MetaAccount; report?: Report; error?: string };
export type DailyPresentation = { layouts?: Record<string,ClientLayout>; exclusions?: Exclusion[]; template?: DailyTemplate; skill?: import('../skills/report-types').SkillVersion };
const escape = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const icon={crit:'🔴',warn:'⚠️',ok:'✓'};
const headerLogo='<div class="logo-mark" aria-hidden="true"><svg viewBox="0 0 18 18" fill="white"><rect x="2" y="9" width="3" height="7" rx="1"/><rect x="7.5" y="5" width="3" height="11" rx="1"/><rect x="13" y="2" width="3" height="14" rx="1"/></svg></div>';
const day = (v: string,year=false) => new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',...(year?{year:'numeric' as const}:{}),timeZone:'UTC'}).format(new Date(v.slice(0,10)+'T00:00:00Z'));
const title = (v:string) => '<p class="section-label">'+escape(v)+'</p>';
const empty = (v:string) => '<p class="empty">'+escape(v)+'</p>';
const badge=(v:string,tone='blue')=>'<span class="badge badge-'+tone+'">'+escape(v)+'</span>';

function tile(item: Fact, style='') {
  return '<div class="kpi-card '+style+'"><div class="kpi-label">'+escape(item.label)+'</div><div class="kpi-value'+(item.value.length>15?' long':'')+'">'+escape(item.value)+'</div><div class="kpi-sub">'+escape(item.detail)+'</div></div>';
}
function issue(tone: Tone,heading:string,detail:string) {
  return '<div class="issue-row '+tone+'"><div class="issue-icon" aria-hidden="true">'+icon[tone]+'</div><div><div class="issue-title">'+escape(heading)+'</div><div class="issue-detail">'+escape(detail)+'</div></div></div>';
}
function campaignPreview(p: Snapshot, currency: string, scope: string) {
  return campaignCards(p.campaigns.map(c=>({...c,stats:c})),p.details,currency,scope);
}
function accountView(entry: Entry,p:Snapshot,layout:ClientLayout|undefined,i:number) {
  const account=entry.account, name=layout?.name||account.name, market=layout?.market||account.timezone||'';
  const spec=layout?.periods?.[i]||defaultLayout(p,layout?.type);
  const findings=p.analysis?.findings ?? dailyFindings(account,p),tone=findings[0]?.tone||'ok';
  const fact=(label:string)=>dailyFact(label,account,p,layout,spec.columns,findings,spec.scopes?.[label]);
  const type=layout?.type||({SALES:'Sales',LEADS:'Lead Gen',VISITS:'Profile Visits',MIXED:'Mixed objectives',MIXROAS:'Sales + Engagement'}[spec.columns]);
  const summary=accountResult(p,spec.columns,type);
  const ref=spec.summary || [];
  const defaultScope=spec.scopes?.[summary.kind==='purchases'?'Purchases':'Leads'] || (spec.kpis.includes('IG Growth CPR')?'IG growth':'');
  const resultMetric=summary.kind==='purchases'?'Purchases':summary.kind==='leads'?'Leads':summary.kind==='instagramVisits'?'IG Growth Results':'';
  const costMetric=summary.kind==='purchases'?'CPP':summary.kind==='leads'?'CPL':summary.kind==='instagramVisits'?'IG Growth CPR':'';
  const scoped=(label:string, hint:string|undefined)=>dailyFact(label,account,p,layout,spec.columns,findings,hint);
  const resultScope=ref[0] || defaultScope, costScope=ref[1] || ref[0] || (summary.kind==='instagramVisits'?defaultScope:'');
  const summaryResult=resultMetric && resultScope ? scoped(resultMetric,resultScope) : { value:count(summary.value),detail:summary.scope };
  const summaryCost=costMetric && costScope ? scoped(costMetric,costScope) : { value:cash(summary.cost,account.currency),detail:summary.scope };
  const compare=(label:string,idx:number)=>ref[idx]==='best'?fact('Best '+label):scoped(label,ref[idx] || (label==='ROAS'?spec.scopes?.ROAS:undefined));
  return {account,p,spec,name,market,type,findings,tone,fact,summary,summaryResult,summaryCost,comparison:[compare('ROAS',2),compare('CTR',3),compare('Freq',4)]};
}
type View = ReturnType<typeof accountView>;
function clientCard(v:View,index:number) {
  return '<button type="button" class="account-card" data-open="'+index+'"><span class="ac-header"><span><span class="ac-name" style="display:block">'+escape(v.name)+'</span><span class="ac-currency">'+escape([v.account.currency,v.market].filter(Boolean).join(' · '))+'</span></span>'+badge(v.type)+'</span><span class="ac-metrics">'+v.spec.cards.map(label=>{
    const k=v.fact(label);
    return '<span title="'+escape(k.detail)+'"><span class="ac-m-label" style="display:block">'+escape(label)+'</span><span class="ac-m-value'+(k.value.length>15?' long':'')+'" style="display:block">'+escape(k.value)+'</span></span>';
  }).join('')+'</span><span class="ac-issues">'+v.findings.slice(0,2).map(f=>'<span class="issue-chip chip-'+f.tone+'" title="'+escape(f.title)+'">'+icon[f.tone]+' '+escape(f.title.split(' · ')[0])+'</span>').join('')+'</span></button>';
}
function detail(v:View,periodName:string) {
  const active=v.p.inventory?.active;
  const actions=new Map(v.findings.map(f=>[f.action,f.reason]));
  return '<div class="overview-bar"><div><div class="overview-name">'+escape(v.name)+'</div><div class="overview-meta">'+escape(['Account '+v.account.id.replace(/^act_/,''),v.account.currency,v.market].filter(Boolean).join(' · '))+'</div></div><div class="overview-tags">'+(active!=null?badge(active+' Active','green'):'')+badge(v.type)+'</div></div>'+
    title(periodName+' — KPIs')+'<div class="kpi-grid">'+v.spec.kpis.map((label,i)=>tile(v.fact(label),i===0?'highlight':label==='Status'&&v.tone==='crit'?'crit':'')).join('')+'</div>'+
    title('Issues & Flags')+'<div class="issues-grid">'+v.findings.map(f=>issue(f.tone,f.title,f.detail)).join('')+v.p.notes.map(n=>issue('warn','Data availability',n)).join('')+'</div>'+
    title('Recommendations')+Array.from(actions,([name,reason],i)=>'<div class="rec-card"><div class="rec-number">Action '+String(i+1).padStart(2,'0')+'</div><div class="rec-title">'+escape(name)+'</div><div class="rec-body">'+escape(reason)+'</div></div>').join('')+
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
  const flags=views.flatMap(v=>v.findings.filter(f=>f.tone==='crit').map(f=>issue('crit',v.name+' — '+f.title,f.detail)));
  const warnings=views.reduce((n,v)=>n+v.findings.filter(f=>f.tone==='warn').length+v.p.notes.length,0);
  return title('All Accounts — '+periodName)+'<div class="all-accounts-grid">'+views.map(clientCard).join('')+'</div><div class="kpi-grid">'+groups.map(g=>g.kpi).join('')+
    tile({label:'Critical Flags',value:String(flags.length),detail:'Across all accounts'},'crit')+tile({label:'Warnings',value:String(warnings),detail:'Across all accounts'})+
    tile({label:'Accounts',value:String(views.length),detail:exclusions.length+' outside this report'})+'</div><hr class="divider">'+title('Side-by-side — '+periodName+' (click a row to open the account)')+
    '<div class="table-wrap"><table class="cmp"><thead><tr>'+['Account','Spend','Results','Cost / Result','ROAS','CTR','Frequency'].map(v=>'<th>'+v+'</th>').join('')+'</tr></thead><tbody>'+groups.map(g=>g.rows).join('')+'</tbody></table></div>'+
    title('Critical Flags — '+periodName)+'<div class="issues-grid">'+(flags.join('')||empty('No critical flags for this period.'))+'</div>'+
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
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Meta Ads — Daily Report</title><style>'+dailyStyles+detailStyles+'.group-heading{background:var(--surface2);font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}</style></head><body>'+
    '<header class="header"><div class="header-inner"><div class="logo-area">'+headerLogo+'<div><div class="header-title">Meta Ads — Daily Report</div><div class="header-subtitle">'+both(i=>escape(names[i]+' · '+ranges[i]))+'</div></div></div><div class="header-meta"><div class="period" role="group" aria-label="Date range"><button data-window="0" class="on" aria-pressed="true">Last 7 days</button><button data-window="1" aria-pressed="false">Last 30 days</button></div>'+badge(valid.length+' Accounts')+badge('Generated '+day(generated,true),'green')+'</div></div></header>'+
    '<div class="tabs-bar">'+both(i=>'<nav class="tabs" aria-label="Report accounts"><button class="tab active" data-key="overview" data-open="overview">Overview</button>'+periods[i].map((v,n)=>'<button class="tab" data-key="'+escape(v.account.id)+'" data-open="'+n+'">'+escape(v.name)+(v.tone==='ok'?'':'<span class="flag-dot '+v.tone+'"></span>')+'</button>').join('')+'</nav>')+'</div>'+
    '<main class="main">'+both(i=>'<h2 class="print-only">'+escape(names[i]+' · '+ranges[i])+'</h2><section class="tab-panel" data-panel="overview">'+overview(periods[i],exclusions,names[i])+'</section>'+periods[i].map((v,n)=>'<section class="tab-panel" data-panel="'+n+'" hidden>'+detail(v,names[i])+'</section>').join(''))+'</main>'+
    '<footer class="footer">'+both(i=>escape('Generated by Tossdown · '+day(generated,true)+' · Meta Ads API'+(presentation.skill?' · Skill '+presentation.skill.name+' '+presentation.skill.sha.slice(0,8):'')+' · '+names[i]+' ('+ranges[i]+') · Spend grouped by currency. Status and bid settings at retrieval. A dash marks an unreported metric.'))+'</footer>'+embeddedTemplate+'<script>'+controls+'\n'+galleryScript+'</script></body></html>';
}

