import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const api=vi.hoisted(()=>({model:vi.fn(),put:vi.fn()}));
vi.mock('../lib/ai/bedrock',()=>({invokeReportModel:api.model}));
vi.mock('@vercel/blob',()=>({put:api.put}));
import {analyzeAccountAudit} from '../lib/reports/audit-analysis';
import {analyzeResearch} from '../lib/reports/research-analysis';
import {draftPlan} from '../lib/reports/plan';
import {getReportingSkills} from '../lib/skills/report-packages';
import {getBuiltinSkills} from '../lib/skills/builtin';
import {metrics,type Report} from '../lib/reports/model';
const report:Report={account:{id:'act_123',name:'Example',currency:'CAD',status:1},generated:'2026-11-23',periods:[{window:{since:'2026-11-16',until:'2026-11-22'},totals:metrics({spend:100,impressions:1000,actions:[{action_type:'lead',value:7}]}),campaigns:[],notes:[]}]};
const answer=(interpretation:string,evidenceIds=['window0:account:leads'])=>({periods:[{periodId:'window0',findings:[{tone:'ok',category:'observation',title:'Measured review',interpretation,evidenceIds,action:'Review the supplied evidence.',reason:'Confirm the business context.'}]}]});
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('BEDROCK_MODEL_ID','synthetic-model');api.put.mockResolvedValue({etag:'test'});});afterEach(()=>vi.unstubAllEnvs());
it('uses the same matching-outcome guard in audits and preserves private execution evidence',async()=>{
 const skill=getBuiltinSkills().find(s=>s.name==='meta-account-audit')!;
 api.model.mockResolvedValue(answer('Reported {{window0:account:leads}} purchases.'));
 expect((await analyzeAccountAudit(report,skill)).status).toBe('unavailable');
 api.model.mockResolvedValue(answer('Reported {{window0:account:leads}} leads.'));
 const result=await analyzeAccountAudit(report,skill);expect(result.status).toBe('complete');expect(result.findings?.[0].evidence).toBe('Reported 7 leads.');expect(result.run?.validationVersion).toBe('measurement-v2');expect(api.put.mock.calls.every(c=>c[2].access==='private')).toBe(true);
});
it('requires source citations for competitor analysis and never accepts invented outcomes',async()=>{
 const skill=getBuiltinSkills().find(s=>s.name==='competitor-creative-research')!;
 const ads=[{id:'source-ad',page_name:'Example advertiser',ad_creative_bodies:['Limited time 15% off']}];
 api.model.mockResolvedValue(answer('The advertiser generated 999 purchases.',['window0:ad:source-ad']));
 expect((await analyzeResearch(skill,{terms:'Example',country:'CA',source:'Foreplay'},ads)).status).toBe('unavailable');
 api.model.mockResolvedValue(answer('The supplied ad promotes 15% off.',['window0:ad:source-ad']));
 expect((await analyzeResearch(skill,{terms:'Example',country:'CA',source:'Foreplay'},ads)).status).toBe('complete');
 api.model.mockResolvedValue(answer('A repeated pattern appears.',['window0:ad:source-ad']));
 expect((await analyzeResearch(skill,{terms:'Example',country:'CA',source:'Foreplay'},ads)).status).toBe('unavailable');
});

it('limits monthly allocations to a current approved profile and binds the approved cap',async()=>{
 const r:Report={...report,periods:[{...report.periods[0],campaigns:[{...report.periods[0].totals!,id:'campaign-a',name:'Lead campaign',objective:'OUTCOME_LEADS',settings:{goals:['LEAD_GENERATION'],bids:[]},status:'ACTIVE',hasInsights:true,start:null,stop:null}]}]};
 const skill=getReportingSkills().find(s=>s.reportType==='monthly')!;
 const raw={summary:'Review measured delivery',financialReview:'Approved cap is {{window0:budget:cap}}.',performance:[],competitors:[],event:'No event supplied',allocation:[{campaignId:'campaign-a',percent:100,rationale:'Use only after client approval'}],concepts:[],takeaways:[],gaps:[]};
 api.model.mockResolvedValue(raw);
 const limited=await draftPlan(r,'2026-12',{cap:1000,brief:'',competitors:'',event:''},skill);
 expect(limited.allocation).toEqual([]);expect(limited.gaps.join(' ')).toContain('missing client strategy');expect(limited.financialReview).toContain('1,000.00');
 r.reviewContext={accountId:'act_123',currency:'CAD',businessGoal:'Acquire inquiries',primaryOutcome:'leads',conversionDefinition:'Quote requests',markets:'Toronto',targetCpl:20,targetOwner:'Account lead',approvedOn:'2026-11-01',validUntil:'2026-12-31',qualificationNotes:'',updatedAt:'2026-11-23T00:00:00Z'};
 const ready=await draftPlan(r,'2026-12',{cap:1000,brief:'',competitors:'',event:''},skill);
 expect(ready.allocation).toHaveLength(1);
 r.reviewContext.validUntil='2026-11-30';
 expect((await draftPlan(r,'2026-12',{cap:1000,brief:'',competitors:'',event:''},skill)).allocation).toEqual([]);
});

it('keeps deterministic source observations when all model commentary fails evidence validation',async()=>{
 const totals=metrics({spend:'100',impressions:'1000',actions:[{action_type:'lead',value:'20'}]});const r:Report={...report,periods:[{...report.periods[0],totals,campaigns:[{...totals,id:'101',name:'Synthetic campaign',objective:'OUTCOME_LEADS',settings:{goals:['LEAD_GENERATION'],bids:[]},status:'ACTIVE',hasInsights:true,start:null,stop:null}]}]};
 api.model.mockResolvedValue(answer('This campaign generated 999 purchases.'));
 const result=await analyzeAccountAudit(r,getBuiltinSkills().find(s=>s.name==='meta-account-audit')!);expect(result.status).toBe('unavailable');expect(result.sourceObservations).toHaveLength(1);expect(result.sourceObservations![0].evidence).toContain('20');expect(result.sourceObservations![0].title).not.toContain('999');
});
