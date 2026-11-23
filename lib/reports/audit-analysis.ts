import {analyzeDailyReport,dailyEvidence,partitionDailyEvidence} from './daily-analysis';
import {getReportingSkills,type ReportingSkill} from '../skills/report-packages';
import type {SkillRecord} from '../skills/types';
import type {Report} from './model';
import type {SkillRun} from '../skills/report-types';
import {reviewQuality,clientReadiness} from './review-quality';

export type AuditAnalysis={status:'complete'|'unavailable';summary?:string;findings?:{title:string;severity:'high'|'medium'|'low'|'info';evidence:string;recommendation:string;evidenceIds?:string[]}[];dataGaps?:string[];message?:string;run?:SkillRun;quality?:ReturnType<typeof reviewQuality>};
export function readOnlyReviewSkill(skill:SkillRecord&{body:string}):ReportingSkill{
 if(skill.status!=='approved'||skill.writeActions||skill.risk==='high')throw Error('Choose an approved read-only analysis method.');
 const base=getReportingSkills()[0];
 return {...base,...skill,reportType:'daily',contract:'daily-v1',platforms:['meta'],writeActions:false,requirements:base.requirements,resources:base.resources,body:skill.body+'\n\nUse the supplied evidence catalog and daily-v1 JSON contract. Every numeric claim must bind its exact matching metric. Source metadata is not a KPI. Do not infer missing measurements or claim business breakeven. Give a factual observation when strategy context is incomplete.',original:skill.body};
}
export async function analyzeAccountAudit(report:Report,skill:SkillRecord&{body:string}):Promise<AuditAnalysis>{
 const p=report.periods[0];
 if(partitionDailyEvidence(dailyEvidence(report)).length>4)return {status:'unavailable',message:'This account needs a larger resumable review. Open Client reports to review the full evidence in saved batches. The measured campaign evidence is shown below.'};
 try{
  const analysis=await analyzeDailyReport(report,readOnlyReviewSkill(skill));
  const period=analysis.periods[0],reviewed={...p,analysis:period};
  return {status:'complete',summary:period.findings.length+' evidence-checked findings for '+p.window.since+' through '+p.window.until+'.',findings:period.findings.map(f=>({title:f.title,severity:f.tone==='crit'?'high':f.tone==='warn'?'medium':'info',evidence:f.interpretation??f.detail,recommendation:f.action,evidenceIds:f.evidenceIds})),dataGaps:[...p.notes,...p.reviewNotes??[],...period.notes??[]],run:analysis.run,quality:reviewQuality(report.account,reviewed,report.reviewContext)};
 }catch{return {status:'unavailable',message:'The analysis could not pass evidence checks or could not be saved. Measured evidence remains available; retry the audit.',quality:reviewQuality(report.account,p,report.reviewContext)};}
}
export {clientReadiness};
