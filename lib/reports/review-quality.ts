import type {MetaAccount} from '../meta/read';
import type {DailyClientContext} from './client-context';
import type {ReportFinding} from '../skills/report-types';
import type {Snapshot} from './model';
import {resultKind} from './daily-metrics';

export type ClientReadiness={status:'ready'|'incomplete';gaps:string[];contextUpdatedAt?:string};
export function clientReadiness(context:DailyClientContext|null|undefined,account:Pick<MetaAccount,'id'|'currency'>,day:string):ClientReadiness{
  const gaps:string[]=[];
  const valid=context?.accountId===account.id&&context.currency===account.currency?context:null;
  if(context&&!valid)gaps.push('Account or currency mismatch');
  if(!valid?.businessGoal?.trim())gaps.push('Business goal');
  if(!valid?.primaryOutcome)gaps.push('Primary outcome');
  if(!valid?.conversionDefinition?.trim())gaps.push('Outcome definition');
  if(!valid?.markets?.trim())gaps.push('Service markets');
  if(!valid?.monthlyBudget||valid.budgetMonth!==day.slice(0,7))gaps.push('Approved budget for '+day.slice(0,7));
  const target=valid?.primaryOutcome==='purchases'?(valid.targetCpa??valid.targetRoas):valid?.primaryOutcome==='leads'?valid.targetCpl:valid?.targetCostPerResult;
  if(!target)gaps.push('Outcome target');
  if(!valid?.targetOwner?.trim()||!valid.approvedOn||valid.approvedOn>day)gaps.push('Target owner and approval date');
  if(!valid?.validUntil||valid.validUntil<day)gaps.push('Current target validity');
  return {status:gaps.length?'incomplete':'ready',gaps,...(valid?{contextUpdatedAt:valid.updatedAt}:{})};
}

export type ReviewCheck={key:string;label:string;status:'available'|'unavailable'|'needs_context'|'not_applicable'};
export type ReviewQuality={status:'reviewed'|'limited'|'unavailable';checks:ReviewCheck[];performanceFindings:number;readiness:ClientReadiness};
export function reviewQuality(account:MetaAccount,p:Snapshot,context?:DailyClientContext|null):ReviewQuality{
  const readiness=clientReadiness(context,account,p.window.until);
  const reporting=p.campaigns.filter(c=>c.hasInsights&&(c.spend??0)>0);
  const measured=reporting.filter(c=>{const kind=resultKind(c);return kind&&c[kind]!=null;});
  const spend=p.totals?.spend!=null;
  const delivery=p.totals?.impressions!=null||p.campaigns.some(c=>c.hasInsights&&c.impressions!=null);
  const result=reporting.length>0&&measured.length===reporting.length;
  const prior=p.previous;
  const comparison=!!prior&&Date.parse(prior.window.until)<Date.parse(p.window.since)&&Date.parse(prior.window.until)-Date.parse(prior.window.since)===Date.parse(p.window.until)-Date.parse(p.window.since)&&(prior.totals?.spend!=null||prior.campaigns.some(c=>c.spend!=null));
  const performanceFindings=(p.analysis?.findings??[]).filter(f=>['win','concern'].includes(f.category??'')&&f.evidenceIds?.some(id=>/:account:|:campaign:|:ad(?:set)?:/.test(id))).length;
  const checks:ReviewCheck[]=[
    {key:'spend',label:'Account spend',status:spend?'available':'unavailable'},
    {key:'delivery',label:'Dated delivery',status:delivery?'available':'unavailable'},
    {key:'outcome',label:'Campaign outcome coverage',status:result?'available':'unavailable'},
    {key:'comparison',label:'Comparable history',status:comparison?'available':'unavailable'},
    {key:'context',label:'Optional commercial target checks',status:readiness.status==='ready'?'available':'not_applicable'},
    {key:'analysis',label:'Performance findings',status:performanceFindings?'available':'unavailable'},
  ];
  const limited=checks.some(c=>c.status!=='available'&&c.status!=='not_applicable')||!!p.analysis?.notes?.length;
  return {status:!spend&&!delivery?'unavailable':limited?'limited':'reviewed',checks,performanceFindings,readiness};
}

const words=(text:string)=>new Set(text.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>2&&!['the','for','and','with','supplied','review','period','campaign','account'].includes(w)));
const overlap=(a:Set<string>,b:Set<string>)=>[...a].filter(x=>b.has(x)).length/Math.max(1,Math.min(a.size,b.size));
export function deduplicateFindings(findings:ReportFinding[]){
  const result:ReportFinding[]=[];
  for(const finding of findings){
    const same=result.some(existing=>{
      if(existing.tone!==finding.tone)return false;
      if(existing.title.trim().toLowerCase()===finding.title.trim().toLowerCase()&&existing.tone===finding.tone&&existing.action===finding.action&&existing.detail===finding.detail)return true;
      if((existing.category??existing.tone)!==(finding.category??finding.tone))return false;
      const a=new Set(existing.evidenceIds??[]),b=new Set(finding.evidenceIds??[]);
      const shared=overlap(a,b);
      return a.size>0&&b.size>0&&shared>=.7&&overlap(words(existing.title),words(finding.title))>=.7;
    });
    if(!same)result.push(finding);
  }
  return result;
}

/** Current source status is reported independently of optional AI prose. */
export function deliveryNotices(account:MetaAccount,p:Snapshot){
  const notices:{title:string;detail:string}[]=[];
  if(account.status!==1)notices.push({title:'Current account status needs review',detail:'Meta returned account status '+account.status+' at retrieval. Check the current account notice.'});
  const disapproved=new Set(Object.values(p.details??{}).flatMap(d=>d.sets.flatMap(s=>s.ads.filter(a=>a.status==='DISAPPROVED').map(a=>a.id))));
  if(disapproved.size)notices.push({title:'Current ad disapprovals',detail:disapproved.size+' ad(s) are marked DISAPPROVED at retrieval: '+[...disapproved].join(', ')+'. This is current status, not proof of historical zero delivery.'});
  return notices;
}
