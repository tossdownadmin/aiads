import { z } from 'zod';
import {selectReportSkill,runReportSkill} from '../skills/report-runner';
import type {ReportingSkill} from '../skills/report-packages';
import type { PlanInputs, Proposal, Report } from './model';

const text = z.string().trim().min(1);
const list = z.array(text).max(12);
const planSchema = z.object({
  summary: text, financialReview: text, performance: list, competitors: list, event: text,
  allocation: z.array(z.object({ campaignId: text, percent: z.number().int().min(1).max(100), rationale: text })).max(15),
  concepts: z.array(z.object({ campaignId: text, concept: text, format: text, visual: text, copy: text })).max(12),
  takeaways: list, gaps: list,
});

export function validateProposal(raw: unknown, ids: string[], cap?: number): Proposal {
  const plan = planSchema.parse(raw);
  const allowed = new Set(ids);
  const seen = new Set<string>();
  for (const item of plan.allocation) {
    if (!allowed.has(item.campaignId) || seen.has(item.campaignId)) throw new Error('Unknown or repeated allocation campaign');
    seen.add(item.campaignId);
  }
  if (plan.concepts.some(c => !allowed.has(c.campaignId))) throw new Error('Unknown creative campaign');
  if (plan.allocation.length && (!cap || plan.allocation.reduce((n, c) => n + c.percent, 0) !== 100)) throw new Error('Invalid budget allocation');
  return plan;
}

export async function draftPlan(report: Report, month: string, inputs: PlanInputs, selectedSkill?:ReportingSkill): Promise<Proposal> {
  const snapshot = report.periods[0];
  const campaigns = snapshot.campaigns.slice(0, 45);

  const inventory=Object.entries(snapshot.details||{}).flatMap(([campaignId,detail])=>detail.sets.flatMap(set=>set.ads.map(ad=>({campaignId,adSetId:set.id,id:ad.id,name:ad.name,stats:ad.stats,days:ad.days,creative:{id:ad.creative.id,copy:ad.creative.copy.slice(0,2),titles:ad.creative.titles,ctas:ad.creative.ctas,formats:[...new Set(ad.creative.assets.map(a=>a.kind))],notes:ad.creative.notes}})))).sort((a,b)=>(b.stats?.spend??0)-(a.stats?.spend??0));
  const evidence = { month, inputs, account: report.account, checkedAt: report.generated, tracking: report.tracking,
    ownAdEvidence:inventory.slice(0,16),adEvidenceCoverage:{available:inventory.length,supplied:Math.min(16,inventory.length),selection:'Highest spend ads; metadata and daily metrics, without image/video visual inspection.'},
    comparison:report.comparison, verifiedCompetitorAds: report.competitorEvidence, period: snapshot.window, totals: snapshot.totals, statusNotes: snapshot.notes, campaigns,
    campaignEvidenceCount: snapshot.campaigns.length, campaignsSupplied: campaigns.length };
  const skill=selectedSkill??await selectReportSkill('monthly');
  const executed=await runReportSkill(skill,evidence,raw=>{
    const plan=validateProposal(raw,campaigns.map(c=>c.id),inputs.cap);
    if (![1,9].includes(report.account.status)||!campaigns.some(c=>(c.spend??0)>0)) {
      plan.allocation=[];plan.gaps.push('A delivery and account-status check is required before allocating a budget.');
    }
    return plan;
  });
  const plan=executed.output;plan.skillRun=executed.run;
  return plan;
}
