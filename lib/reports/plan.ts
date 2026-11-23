import {dailyEvidence} from './daily-analysis';
import {renderMeasuredText,type MeasurementEvidence} from './measured-text';
import {clientReadiness} from './review-quality';
import {cash} from './daily-metrics';
import {validateTargetClaims,validatePlanningClaims} from '../skills/report-claims';
import { z } from 'zod';
import {selectReportSkill,runReportSkill} from '../skills/report-runner';
import type {ReportingSkill} from '../skills/report-packages';
import type { PlanInputs, Proposal, Report } from './model';

const text = z.string().trim().min(1);
const list = z.array(text).max(12);
const planSchema = z.object({
  evidenceIds:z.array(z.string().min(1).max(200)).max(100).optional(),
  summary: text, financialReview: text, performance: list, competitors: list, event: text,
  allocation: z.array(z.object({ campaignId: text, percent: z.number().int().min(1).max(100), rationale: text })).max(15),
  concepts: z.array(z.object({ campaignId: text, concept: text, format: text, visual: text, copy: text })).max(12),
  takeaways: list, gaps: list,
});

export function validateProposal(raw: unknown, ids: string[], cap?: number,evidence?:MeasurementEvidence): Proposal {
  const plan = planSchema.parse(raw);
  validatePlanningClaims(plan);
  const allowed = new Set(ids);
  const seen = new Set<string>();
  for (const item of plan.allocation) {
    if (!allowed.has(item.campaignId) || seen.has(item.campaignId)) throw new Error('Unknown or repeated allocation campaign');
    seen.add(item.campaignId);
  }
  if (plan.concepts.some(c => !allowed.has(c.campaignId))) throw new Error('Unknown creative campaign');
  if (plan.allocation.length && (!cap || plan.allocation.reduce((n, c) => n + c.percent, 0) !== 100)) throw new Error('Invalid budget allocation');
  const catalog=evidence??{account:{id:'plan',name:'Planning account',currency:'USD'},periods:[{id:'window0',window:{since:'2000-01-01',until:'2000-01-01'},campaigns:ids.map(id=>({id,name:id}))}],facts:[]};
  const allText=JSON.stringify(plan),bindings=[...allText.matchAll(/\{\{([^{}]+)\}\}/g)].map(m=>m[1]);
  const cited=[...new Set([...(plan.evidenceIds??[]),...bindings.map(id=>catalog.facts.some(f=>f.id===id)?id:id.replace(/:(?:spend|ctr|cpc|leads|purchases|frequency|roas|reach|impressions|instagramVisits|facebookVisits|linkClicks|landingViews|thruplays)$/,''))])];
  const facts=new Map(catalog.facts.map(f=>[f.id,f]));
  if(cited.some(id=>!facts.has(id)))throw Error('Unknown planning evidence reference.');
  const render=(value:string)=>renderMeasuredText(value,cited,facts,{...catalog,requireBindings:true},true);
  for(const key of ['summary','financialReview','event'] as const)plan[key]=render(plan[key]);
  for(const key of ['performance','competitors','takeaways','gaps'] as const)plan[key]=plan[key].map(render);
  plan.allocation=plan.allocation.map(item=>({...item,rationale:render(item.rationale)}));
  plan.concepts=plan.concepts.map(item=>({...item,concept:render(item.concept),format:render(item.format),visual:render(item.visual),copy:render(item.copy)}));
  return {...plan,evidenceIds:cited};
}

export async function draftPlan(report: Report, month: string, inputs: PlanInputs, selectedSkill?:ReportingSkill): Promise<Proposal> {
  const snapshot = report.periods[0];
  const campaigns = snapshot.campaigns.slice(0, 45);

  const inventory=Object.entries(snapshot.details||{}).flatMap(([campaignId,detail])=>detail.sets.flatMap(set=>set.ads.map(ad=>({campaignId,adSetId:set.id,id:ad.id,name:ad.name,stats:ad.stats,days:ad.days,creative:{id:ad.creative.id,copy:ad.creative.copy.slice(0,2),titles:ad.creative.titles,ctas:ad.creative.ctas,formats:[...new Set(ad.creative.assets.map(a=>a.kind))],notes:ad.creative.notes}})))).sort((a,b)=>(b.stats?.spend??0)-(a.stats?.spend??0));
  const source={...report,periods:[{...snapshot,previous:report.comparison?{...report.comparison,campaigns:[]}:snapshot.previous}]};
  const catalog=dailyEvidence(source);
  if(inputs.cap)catalog.facts.push({id:'window0:budget:cap',periodId:'window0',value:inputs.cap,display:'Approved plan cap: '+report.account.currency+' '+cash(inputs.cap,report.account.currency)});
  if(inputs.previousCap)catalog.facts.push({id:'window0:budget:previousCap',periodId:'window0',value:inputs.previousCap,display:'Previous period cap: '+report.account.currency+' '+cash(inputs.previousCap,report.account.currency)});
  const selectedIds=new Set(campaigns.map(c=>c.id)),adIds=new Set(inventory.slice(0,16).map(a=>a.id));
  catalog.facts=catalog.facts.filter(f=>{const c=f.id.match(/:campaign:([^:]+):/),a=f.id.match(/:ad:([^:]+)$/);return (!c||selectedIds.has(c[1]))&&(!a||adIds.has(a[1]));});
  const readiness=clientReadiness(report.reviewContext?{...report.reviewContext,...(inputs.cap?{monthlyBudget:inputs.cap,budgetMonth:month}:{})}:null,report.account,month+'-01');
  const evidence = { facts:catalog.facts,clientProfile:report.reviewContext,readiness,measurementInstructions:'Bind every quantitative statement with {{exact-fact-id}} using the matching outcome. Never relabel leads as purchases or visits as followers. Cite facts in evidenceIds. Keep proposed copy free of unapproved numeric offers. No business breakeven claims. When readiness is incomplete, describe gaps and do not propose budget allocations.',month, inputs, account: report.account, checkedAt: report.generated, tracking: report.tracking,
    ownAdEvidence:inventory.slice(0,16),adEvidenceCoverage:{available:inventory.length,supplied:Math.min(16,inventory.length),selection:'Highest spend ads; metadata and daily metrics, without image/video visual inspection.'},
    comparison:report.comparison, verifiedCompetitorAds: report.competitorEvidence, period: snapshot.window, totals: snapshot.totals, statusNotes: snapshot.notes, campaigns,
    campaignEvidenceCount: snapshot.campaigns.length, campaignsSupplied: campaigns.length };
  const skill=selectedSkill??await selectReportSkill('monthly');
  const executed=await runReportSkill(skill,evidence,raw=>{
    const plan=validateProposal(raw,campaigns.map(c=>c.id),inputs.cap,catalog);
    validateTargetClaims(plan,readiness.status==='ready',plan.evidenceIds?.some(id=>id.includes(':target:'))??false,plan.evidenceIds?.some(id=>id.includes(':previous-')||id.endsWith(':change'))??false);
    if (readiness.status!=='ready'||![1,9].includes(report.account.status)||!campaigns.some(c=>(c.spend??0)>0)) {
      plan.allocation=[];plan.gaps.push(readiness.status!=='ready'?'Approve the missing client strategy inputs before allocating a budget: '+readiness.gaps.join(', ')+'.':'A delivery and account-status check is required before allocating a budget.');
    }
    return plan;
  });
  const plan=executed.output;plan.skillRun=executed.run;
  return plan;
}
