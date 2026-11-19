import type { MetaAccount } from '../meta/read';
import { money, type CampaignRow, type Metrics, type Snapshot } from './model';
import type { ClientLayout, ColumnSet, PeriodLayout } from './daily-template';

export type Tone = 'ok' | 'warn' | 'crit';
export type Finding = { tone: Tone; title: string; detail: string; action: string; reason: string };
export type Fact = { label: string; value: string; detail: string };
export const dash = '—';
const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
export const count = (n: number | null | undefined) => n == null ? dash : num.format(n);
export const percent = (n: number | null | undefined) => n == null ? dash : (n > 0 && n < .1 ? n.toFixed(3) : n.toFixed(2)) + '%';
export const ratio = (n: number | null | undefined) => n == null ? dash : n.toFixed(2) + '×';
export function cash(n: number | null | undefined, currency: string) {
  if (n == null) return dash;
  if (currency==='PKR') return '₨'+n.toLocaleString('en-US',{maximumFractionDigits:0});
  if (currency==='CAD' || currency==='USD') return '$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  return money(n,currency);
}
const per = (spend: number | null | undefined, total: number | null | undefined) => spend != null && total != null && total>0 ? spend/total : null;
const short = (t: string) => t.trim().replace(/_/g,' ');
const goalText = (c: CampaignRow) => (c.settings?.goals ?? []).join(' ');
const combined = (c: CampaignRow) => [c.name,c.objective,goalText(c)].join(' ');
export const statusText = (s: string) => short(s).toLowerCase().replace(/^./,v=>v.toUpperCase());
export type ResultKey = 'purchases'|'leads'|'conversations'|'instagramVisits'|'facebookVisits'|'thruplays'|'landingViews'|'linkClicks';
const resultNames: Record<ResultKey,string> = { purchases:'purchases', leads:'leads', conversations:'chats', instagramVisits:'IG profile visits', facebookVisits:'FB profile visits', thruplays:'ThruPlays', landingViews:'landing page views', linkClicks:'link clicks' };
export function resultKind(c: CampaignRow): ResultKey | undefined {
  const name = c.name.toLowerCase(), goals=goalText(c), objective=c.objective.toUpperCase();
  if (/messag|conversation|whatsapp/.test(name) || /CONVERSATIONS|MESSAGING/.test(goals)) return 'conversations';
  if (/LEAD/.test(objective) || /LEAD_GENERATION|QUALITY_LEAD/.test(goals)) return 'leads';
  if (/SALES|CONVERSIONS/.test(objective) || /purchase|sales campaign/.test(name)) return 'purchases';
  if (/(facebook|\bfb\b).*profile|profile.*(facebook|\bfb\b)/.test(name)) return 'facebookVisits';
  if (c.conversations != null && c.conversations > 0 && /ENGAGEMENT|MESSAGES/.test(objective) && !/profile|follower/.test(name)) return 'conversations';
  if (/profile|follower|instagram post/.test(name) || /PROFILE_VISIT/.test(goals)) return 'instagramVisits';
  if (/THRUPLAY|VIDEO_VIEW/.test(goals) || /video view/.test(name)) return 'thruplays';
  if (/LANDING_PAGE_VIEWS/.test(goals)) return 'landingViews';
  if (/LINK_CLICKS/.test(goals)) return 'linkClicks';
  if (c.thruplays != null && c.thruplays > 0 && /AWARENESS|VIDEO/.test(objective)) return 'thruplays';
}
export const resultLabel = (key: ResultKey) => resultNames[key];
export const costPer = per;
export function defaultLayout(period: Snapshot, type=''): PeriodLayout {
  const first=period.campaigns.find(c=>(c.spend??0)>0);
  const kind=first && resultKind(first);
  const columns: ColumnSet = /lead/i.test(type) || kind==='leads' ? 'LEADS' : /sale/i.test(type) || kind==='purchases' ? 'SALES' : kind==='instagramVisits' || kind==='facebookVisits' ? 'VISITS' : 'MIXED';
  const core = columns==='LEADS' ? ['Leads','CPL'] : columns==='SALES' ? ['Purchases','ROAS'] : columns==='VISITS' ? ['Profile Visits','Cost/Visit'] : ['Results','Cost/Result'];
  return {columns,cards:['Spend',...core,'Frequency'],kpis:['Total Spend',...core,'CTR','Frequency','Status']};
}

const selectors: [RegExp,RegExp][] = [
  [/nb\+ns/i,/new brunswick|nova scotia|\bnb\s*\+\s*ns\b/i], [/courtenay/i,/courtenay|campbell river|camperbell/i],
  [/08\/10/i,/08[-/]10(?:[-/]20)?/i],[/21\/10/i,/21[-/]10(?:[-/]20)?/i],
  [/one.stop/i,/one.stop/i],[/celebration/i,/celebration/i],[/post.workout/i,/post.workout/i],
  [/lahore/i,/lahore/i],[/grocery/i,/grocery/i],[/karahi/i,/karahi/i],[/mutton/i,/mutton/i],
  [/ig growth/i,/follower growth|ig growth/i],[/awareness/i,/awareness/i],
  [/video/i,/video views?|thruplay/i],[/fb profile/i,/(?:facebook|\bfb\b).*profile|profile.*(?:facebook|\bfb\b)/i],
  [/ig profile/i,/(?:instagram|\big\b).*profile|profile.*(?:instagram|\big\b)/i],
  [/profile/i,/profile visit|follower growth|profile_visit/i],[/\bsale\b/i,/sales?|conversions/i],
];
function scopedCampaign(label: string, delivered: CampaignRow[]) {
  const selector=selectors.find(([target])=>target.test(label))?.[1];
  if (!selector) return undefined;
  return delivered.find(c=>selector.test(c.name)) ?? delivered.find(c=>selector.test(combined(c)));
}
function highest(rows: CampaignRow[], key: 'ctr'|'roas'|'frequency') {
  return rows.filter(c=>c[key]!=null).sort((a,b)=>b[key]!-a[key]!)[0];
}
function leadComparison(rows: CampaignRow[]) {
  return rows.filter(c=>resultKind(c)==='leads' && (c.leads??0)>0 && c.spend!=null)
    .sort((a,b)=>per(a.spend,a.leads)!-per(b.spend,b.leads)!);
}
export function dailyFindings(account: MetaAccount, p: Snapshot): Finding[] {
  const findings: Finding[]=[];
  const add=(tone: Tone,title:string,detail:string,action:string,reason:string)=>findings.push({tone,title,detail,action,reason});
  const rows=p.campaigns.filter(c=>(c.spend??0)>0 || (c.impressions??0)>0);
  if ([2,3,7,8,100,101].includes(account.status)) add('crit','Current account status needs review','Meta returned account status '+account.status+' at retrieval.','Review account status in Ads Manager','Check the current account notice before scheduling delivery.');
  if (!rows.length) {
    const confirmed=p.totals?.spend===0 && p.totals?.impressions===0;
    add(confirmed?'crit':'warn', confirmed?'Zero reported delivery':'No campaign delivery returned',
      confirmed?'Meta reported zero spend and zero impressions in this window.':'Meta returned no campaign row with delivery for these dates.',
      'Check the intended schedule', 'Confirm whether the account was meant to run in this period and review delivery diagnostics for scheduled campaigns.');
  }
  const frequency=highest(rows,'frequency');
  if (frequency && frequency.frequency!>=3.5) add(frequency.frequency!>=5?'crit':'warn','Repeated exposure · '+frequency.name,'Frequency reached '+count(frequency.frequency)+' in this window.','Review the creative and audience for '+frequency.name,'Compare response and cost per result over time before deciding whether to rotate creative.');
  const sale=rows.filter(c=>resultKind(c)==='purchases' && c.roas!=null).sort((a,b)=>a.roas!-b.roas!)[0];
  if (sale && sale.roas!<1) add('crit','Attributed purchase value below spend',sale.name+' reported '+ratio(sale.roas)+' purchase ROAS on '+cash(sale.spend,account.currency)+'.','Reconcile orders for '+sale.name,'Check purchase tracking, order value and fulfilment before revising the budget.');
  const awareness=rows.find(c=>/awareness/i.test(c.name+' '+c.objective) && c.ctr!=null && c.ctr<.5 && (c.impressions??0)>=1000);
  if (awareness) add('warn','Awareness click-through rate · '+awareness.name,percent(awareness.ctr)+' CTR on '+cash(awareness.spend,account.currency)+' spend and '+count(awareness.reach)+' people reached.','Review the awareness creative against its objective','If the brief calls for traffic, test the call to action. For an awareness brief, assess reach and frequency alongside CTR.');
  const missed=rows.find(c=>{const k=resultKind(c);return (k==='purchases'||k==='leads')&&(c[k]??0)===0;});
  if (missed) { const k=resultKind(missed)!;add('warn','Review reported '+resultNames[k]+' · '+missed.name,cash(missed.spend,account.currency)+' spent. '+(missed[k]===0?'Meta explicitly reported zero.':'Meta did not return a count for this outcome.'),'Verify the outcome for '+missed.name,'Check the optimized event and reporting attribution before comparing this campaign’s cost per result.'); }
  const leads=leadComparison(rows);
  if (leads.length>1) {
    const low=leads[0],high=leads[leads.length-1];
    const diff=per(high.spend,high.leads)!-per(low.spend,low.leads)!;
    if (diff>0) add('ok','Cost per lead differs by campaign',low.name+' delivered '+count(low.leads)+' leads at '+cash(per(low.spend,low.leads),account.currency)+' each. '+high.name+' delivered '+count(high.leads)+' at '+cash(per(high.spend,high.leads),account.currency)+'.','Compare lead quality for the two campaigns','Review the higher-cost campaign’s hook and lead-to-booking rate before moving spend.');
  }
  const visits=rows.find(c=>/profile|follower/i.test(c.name) && c.instagramVisits!=null && c.instagramVisits>0);
  if (visits) add('ok','Instagram profile visits · '+visits.name,count(visits.instagramVisits)+' visits at '+cash(per(visits.spend,visits.instagramVisits),account.currency)+' each.','Check how profile visits translate into follows','Compare visits, follows and the profile call to action for the same period.');
  const video=rows.find(c=>resultKind(c)==='thruplays' && (c.thruplays??0)>0);
  if (video) add('ok','Video delivery · '+video.name,count(video.thruplays)+' ThruPlays at '+cash(per(video.spend,video.thruplays),account.currency)+' each. '+count(video.linkClicks)+' link clicks.','Evaluate the video against its viewing goal','Use cost per ThruPlay for video delivery and review destination clicks separately.');
  const clickCampaigns=rows.filter(c=>c.ctr!=null && (c.impressions??0)>=1000 && ['linkClicks','landingViews','instagramVisits','facebookVisits'].includes(resultKind(c)??''));
  const lowest=clickCampaigns.sort((a,b)=>a.ctr!-b.ctr!)[0];
  if (lowest && lowest.ctr!<.5) add('warn','Low click-through rate · '+lowest.name,percent(lowest.ctr)+' CTR across '+count(lowest.impressions)+' impressions.','Check the message and destination for '+lowest.name,'Review the offer, placement and destination before testing a new creative.');
  const chat=rows.find(c=>(c.conversations??0)>0);
  if (chat) add('ok','Messaging conversations · '+chat.name,count(chat.conversations)+' starts at '+cash(per(chat.spend,chat.conversations),account.currency)+' per conversation.','Review conversation quality','Compare conversation starts with qualified inquiries or orders in the same period.');
  const quiet=p.campaigns.filter(c=>!c.hasInsights && c.status==='ACTIVE');
  if (quiet.length && rows.length) add('warn','Active campaigns without an insight row',quiet.slice(0,2).map(c=>c.name).join(' · '),'Check scheduled delivery','Review start dates, end dates and availability for these campaigns.');
  if (!findings.length && rows.length) {
    const top=rows[0], k=resultKind(top);
    add('ok','Highest spend · '+top.name,cash(top.spend,account.currency)+' in this window'+(k&&top[k]!=null?' with '+count(top[k])+' '+resultNames[k]:'')+'.','Review the highest-spend campaign first','Compare its objective and recent results with the client’s targets.');
  }
  const rank={crit:0,warn:1,ok:2};return findings.sort((a,b)=>rank[a.tone]-rank[b.tone]);
}

export function accountResult(p: Snapshot, columns: ColumnSet, type='') {
  const rows=p.campaigns.filter(c=>(c.spend??0)>0);
  const first=rows[0]; const kind: ResultKey | undefined=columns==='LEADS'?'leads':columns==='SALES'||columns==='MIXROAS'?'purchases':/growth|profile|visits/i.test(type)?(first && resultKind(first)==='facebookVisits'?'facebookVisits':'instagramVisits'):first && resultKind(first);
  if (!kind) return {kind, value:null, cost:null, scope:'No primary outcome reported'};
  const data=p.totals;
  return { kind, value:data?.[kind]??null, cost:per(data?.spend,data?.[kind]), scope:'Account spend / account '+resultNames[kind] };
}

export function dailyFact(label: string, account: MetaAccount, p: Snapshot, layout: ClientLayout | undefined, columns: ColumnSet, findings: Finding[], scopeHint=''): Fact {
  const rows=p.campaigns.filter(c=>(c.spend??0)>0 || (c.impressions??0)>0);
  const scopeName=scopeHint || label;
  const focus=scopedCampaign(scopeName,rows);
  const hasSelector=selectors.some(([pattern])=>pattern.test(scopeName));
  const aggregate=p.totals;
  const status=findings.some(f=>f.tone==='crit')?'Critical':findings.some(f=>f.tone==='warn')?'Watch':'Healthy';
  const primary=accountResult(p,columns,layout?.type);
  const out=(value:string,detail:string='Account total')=>({label,value,detail});
  const data: Metrics|null|undefined=hasSelector?focus:aggregate;
  const scope=hasSelector?(focus?.name??'No matching campaign with delivery'):'Account total';
  const l=label.toLowerCase();
  if (l==='status') return out(status,findings[0]?.title??'Delivery review');
  if (l==='action') return out(status==='Healthy'?'Monitor':'Review',findings[0]?.action??'Review delivery');
  if (l==='data' && rows.length===1 && rows[0].start && rows[0].start>=p.window.since && rows[0].start<=p.window.until) {
    const days=Math.floor((Date.parse(p.window.until)-Date.parse(rows[0].start))/86400000)+1;
    return out(days+(days===1?' day':' days')+' since launch',rows[0].name);
  }
  if (l==='data') return out(aggregate?'Available':'Unreported','Account insights in this window');
  const labels=layout?.periods?.flatMap(period=>[...period.cards,...period.kpis])??[];
  if (l==='active campaigns' && labels.includes('Total ACTIVE Status')) return out(count(rows.filter(c=>(c.spend??0)>0).length),'Campaigns with reported spend during the window');
  if (l==='active campaigns'||l==='campaigns (active)'||l==='total active status') return out(count(p.inventory?.active), 'Current effective status');
  if (l==='campaigns' && labels.includes('Total ACTIVE Status')) return out(count(p.inventory?.active),'Current effective status');
  if (l==='campaigns'||l==='total campaigns') return out(count(p.inventory?.total),'Current inventory');
  if (l==='campaign'||l==='best campaign') {
    const c=l==='best campaign'?highest(rows,'ctr'):rows[0];
    return out(c?.name??dash,l==='best campaign'?'Highest reported campaign CTR':'Highest campaign spend');
  }
  if (l==='launched'||l==='days live') {
    const c=rows.filter(c=>c.start && c.start<=p.window.until).sort((a,b)=>b.start!.localeCompare(a.start!))[0];
    if (!c?.start) return out(dash,'Start date unavailable');
    const days=Math.floor((Date.parse(p.window.until)-Date.parse(c.start))/86400000)+1;
    return out(l==='launched'?c.start:count(days),c.name);
  }
  if (l==='30-day delivery') return out(aggregate?.impressions!=null?count(aggregate.impressions):dash,'Impressions in the window');
  if (l==='form leads') return out(count(aggregate?.formLeads),aggregate?.formLeads==null && aggregate?.onMetaLeads!=null ? count(aggregate.onMetaLeads)+' on-Meta leads. Instant-form split unavailable.' : 'Explicit instant-form action');
  if (l==='conv. leads') return out(count(aggregate?.conversionLeads),aggregate?.conversionLeads==null && aggregate?.websiteLeads!=null ? count(aggregate.websiteLeads)+' website leads. Converted-lead split unavailable.' : 'Reported converted lead action');
  if (l==='best ctr'||l==='best roas') {const isCtr=l==='best ctr',c=highest(rows,isCtr?'ctr':'roas'); return out(isCtr?percent(c?.ctr):ratio(c?.roas),c?.name??'No reported value');}
  if (/spend/.test(l)) return out(cash(data?.spend,account.currency),scope);
  if (/ctr/.test(l)) return out(percent(data?.ctr),scope);
  if (/freq/.test(l)) return out(count(data?.frequency),scope);
  if (/roas/.test(l)) return out(ratio(data?.roas),scope);
  if (/cpp/.test(l)) return out(cash(per(data?.spend,data?.purchases),account.currency),scope);
  if (/cpl/.test(l)) return out(cash(per(data?.spend,data?.leads),account.currency),scope);
  if (/leads/.test(l)) return out(count(data?.leads),scope);
  if (/purchases/.test(l)) return out(count(data?.purchases),scope);
  if (/thruplays/.test(l)) return out(count(data?.thruplays),scope);
  if (/ig growth cpr|cost\/visit/.test(l)) return out(cash(per(data?.spend,data?.instagramVisits),account.currency),scope);
  if (/ig growth results|ig profile visits|^profile visits$/.test(l)) return out(count(data?.instagramVisits),scope);
  if (l==='fb profile visits') return out(count(focus?.facebookVisits),scope);
  if (l==='results') return out(count(primary.value),primary.kind?resultNames[primary.kind]:primary.scope);
  if (l==='cost/result') return out(cash(primary.cost,account.currency),primary.scope);
  return out(dash,'No reported metric for this label');
}

