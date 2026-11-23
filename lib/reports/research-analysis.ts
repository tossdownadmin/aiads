import {runReportSkill} from '../skills/report-runner';
import {readOnlyReviewSkill,type AuditAnalysis} from './audit-analysis';
import {dailyEvidence,validateDailyAnalysis,recoverDailyFindings} from './daily-analysis';
import {deduplicateFindings} from './review-quality';
import type {SkillRecord} from '../skills/types';
import type {DailyClientContext} from './client-context';

export async function analyzeResearch(skill:SkillRecord&{body:string},search:{source:string;terms:string;country:string},ads:Record<string,unknown>[],context?:DailyClientContext|null):Promise<AuditAnalysis>{
 const day=new Date().toISOString().slice(0,10);
 const evidence=dailyEvidence({account:{id:'public-library',name:search.source,currency:'USD',status:1},generated:new Date().toISOString(),periods:[{window:{since:day,until:day},totals:null,campaigns:[],notes:['Public creative records do not supply spend, conversions or effectiveness.']}]});
 const ids=new Set<string>();
 for(const ad of ads){
  const id=String(ad.id);if(!id||ids.has(id))throw Error('Choose distinct source ad records.');ids.add(id);
  evidence.facts.push({id:'window0:ad:'+id,periodId:'window0',value:{id,name:String(ad.page_name??'Advertiser'),copy:ad.ad_creative_bodies??[],record:ad},display:'Public ad '+id+' — '+String(ad.page_name??'Advertiser')+': supplied text and metadata; no performance evidence.'});
 }
 const validate=(raw:unknown)=>{
  const checked=validateDailyAnalysis(raw,evidence);
  for(const p of checked)for(const f of p.findings){
   const sources=f.evidenceIds?.filter(id=>id.startsWith('window0:ad:'))??[];
   if(!sources.length)throw Error('Cite the source ad records behind each creative observation.');
   if(/\b(?:repeated|recurring|across ads|common pattern)\b/i.test(f.title+' '+f.interpretation)&&sources.length<2)throw Error('A repeated pattern requires multiple distinct source records.');
  }
  return checked;
 };
 const modelInput={...evidence,search,clientProfile:context??null,instructions:'Analyze only the selected public ad text and metadata. Return daily-v1 findings for window0, citing exact window0:ad IDs. No competitor performance claims. Do not claim to inspect images/video. Without an approved client profile, limit recommendations to research checks rather than brand-specific test concepts. Exact percentage-off offer phrases in cited ad copy may be described as offers; they are never performance measurements.'};
 try{
  const run=await runReportSkill(readOnlyReviewSkill(skill),modelInput,validate);
  const period=run.output[0],findings=deduplicateFindings(period.findings);
  return {status:'complete',summary:findings.length+' source-cited creative observations.',findings:findings.map(f=>({title:f.title,severity:f.tone==='crit'?'high':f.tone==='warn'?'medium':'info',evidence:f.interpretation??f.detail,recommendation:f.action,evidenceIds:f.evidenceIds})),dataGaps:['Creative images/videos were not visually analyzed. Public ad presence does not establish performance.',...(!context?['No approved client business profile supplied.']:[])],run:run.run};
 }catch{return {status:'unavailable',message:'The creative review could not pass source/evidence checks or could not be saved. The selected ad records remain available.'};}
}
