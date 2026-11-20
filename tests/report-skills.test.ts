import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {getReportingSkills,skillVersion,checkReportSkill} from '../lib/skills/report-packages';
import {dailyEvidence,validateDailyAnalysis,analyzeDailyReport} from '../lib/reports/daily-analysis';
import {renderDailyDocument} from '../lib/reports/daily-document';
import {metrics,type Report} from '../lib/reports/model';
import {draftPlan,validateProposal} from '../lib/reports/plan';
const api=vi.hoisted(()=>({model:vi.fn(),put:vi.fn()}));
vi.mock('../lib/ai/bedrock',()=>({invokeReportModel:api.model}));
vi.mock('@vercel/blob',()=>({put:api.put}));
import {runReportSkill} from '../lib/skills/report-runner';
const account={id:'act_123',name:'Test account',currency:'CAD',status:1};
const report:Report={account,generated:'2026-11-20T00:00:00Z',periods:[{window:{since:'2026-11-12',until:'2026-11-18'},totals:metrics({spend:'10',ctr:'1',impressions:'1000'}),campaigns:[],notes:[]},{window:{since:'2026-10-20',until:'2026-11-18'},totals:metrics({spend:'30',ctr:'2',impressions:'2000'}),campaigns:[],notes:[]}]};
const answer={periods:[0,1].map(i=>({periodId:'window'+i,findings:[{tone:'ok',title:'Measured account review',interpretation:'Check this delivery against the brief.',evidenceIds:['window'+i+':account:spend'],action:'Review objectives',reason:'The brief is not supplied.'}]}))};
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('BEDROCK_MODEL_ID','test-model');api.put.mockResolvedValue({etag:'v1'});api.model.mockResolvedValue(answer);});
afterEach(()=>vi.unstubAllEnvs());
it('loads real instructions and resources and rejects unsupported skill capabilities',()=>{
 const [daily,monthly]=getReportingSkills();expect(daily.body).toContain('references/methodology.md');expect(daily.resources.some(r=>r.content.includes('overlapping')||r.content.includes('independent before/after'))).toBe(true);expect(monthly.reportType).toBe('monthly');
 expect(skillVersion({...daily,resources:[...daily.resources,{path:'changed',content:'changed method'}]}).packageHash).not.toBe(skillVersion(daily).packageHash);
 expect(()=>checkReportSkill({...daily,requirements:['arbitrary-script']},'daily')).toThrow('unsupported');expect(()=>checkReportSkill(daily,'monthly')).toThrow('approved');expect(()=>checkReportSkill({...daily,writeActions:true},'daily')).toThrow();
});
it('sends the actual skill and reference contents to Claude and retains private provenance',async()=>{
 const skill=getReportingSkills()[0];const result=await runReportSkill(skill,{measured:true},raw=>raw);
 expect(api.model.mock.calls[0][0]).toContain(skill.body);for(const ref of skill.resources)expect(api.model.mock.calls[0][0]).toContain(ref.content);
 expect(result.run).toMatchObject({model:'test-model',skill:{name:'daily-meta-review',sha:skill.sha}});expect(result.run.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
 expect(api.put).toHaveBeenCalledTimes(3);expect(api.put.mock.calls.every(c=>c[2].access==='private')).toBe(true);
});
it('validates window coverage and citations before retaining a successful result',async()=>{
 const evidence=dailyEvidence(report);expect(()=>validateDailyAnalysis({periods:[answer.periods[0]]},evidence)).toThrow('every');
 expect(()=>validateDailyAnalysis({periods:[answer.periods[0],{...answer.periods[1],findings:[{...answer.periods[1].findings[0],evidenceIds:['window0:account:spend']}]}]},evidence)).toThrow('outside');
 api.model.mockResolvedValue({periods:[]});await expect(analyzeDailyReport(report,getReportingSkills()[0])).rejects.toThrow();expect(api.put).not.toHaveBeenCalled();
});
it('uses skill findings while keeping measured KPI values and template structure',async()=>{
 const before=JSON.stringify(report);const analysis=await analyzeDailyReport(report,getReportingSkills()[0]);expect(JSON.stringify(report)).toBe(before);
 const supplied=JSON.parse(api.model.mock.calls[0][1]);expect(supplied.facts).toEqual(dailyEvidence(report).facts.map(({id,value})=>({id,value})));
 const updated={...report,periods:report.periods.map((p,i)=>({...p,analysis:{findings:analysis.periods[i].findings}}))};
 const original=renderDailyDocument([{account,report}],'2026-11-18'),html=renderDailyDocument([{account,report:updated}],'2026-11-18',{skill:analysis.run.skill});
 const kpis=(value:string)=>Array.from(value.matchAll(/class="kpi-label">([^<]*)<\/div><div class="kpi-value[^"]*">([^<]*)/g),m=>[m[1],m[2]]).filter(([label])=>!['Critical Flags','Warnings','Status'].includes(label));
 expect(kpis(html)).toEqual(kpis(original));expect(html).toContain('Measured account review');expect(html).toContain('Daily Report');expect(html).toContain('daily-meta-review');expect((html.match(/class="tab-panel"/g)||[]).length).toBe((original.match(/class="tab-panel"/g)||[]).length);

});
it('monthly planning runs its reporting skill and validates actual campaign IDs before storage',async()=>{
 const monthly=getReportingSkills()[1];api.model.mockResolvedValue({summary:'Measured plan',financialReview:'No approved cap.',performance:[],competitors:[],event:'No event evidence.',allocation:[],concepts:[],takeaways:[],gaps:[]});
 const result=await draftPlan(report,'2026-12',{brief:'',competitors:'',event:''},monthly);expect(result.skillRun?.skill.name).toBe('monthly-meta-plan');expect(api.model.mock.calls[0][0]).toContain(monthly.resources[0].content);
 api.put.mockClear();api.model.mockResolvedValue({summary:'Plan',financialReview:'Review',performance:[],competitors:[],event:'None',allocation:[],concepts:[{campaignId:'invented',concept:'x',format:'x',visual:'x',copy:'x'}],takeaways:[],gaps:[]});await expect(draftPlan(report,'2026-12',{brief:'',competitors:'',event:''},monthly)).rejects.toThrow('Unknown creative');expect(api.put).not.toHaveBeenCalled();
});

it('rejects unsupported fatigue and tracking diagnoses in planning output',()=>{
 const base={summary:'Measured plan',financialReview:'No cap',performance:[],competitors:[],event:'None',allocation:[],concepts:[],takeaways:[],gaps:[]};

 expect(()=>validateProposal({...base,summary:'The campaign shows audience fatigue at high frequency.'},[])).toThrow('fatigue');
 expect(()=>validateProposal({...base,summary:'No conversion tracking is active.'},[])).toThrow('configuration');
});

it('does not accept a historical zero-delivery claim based on missing reporting',()=>{
 const unknown={...report,periods:report.periods.map(p=>({...p,totals:null}))};
 const bad={periods:answer.periods.map(p=>({...p,findings:p.findings.map(f=>({...f,interpretation:'No ads were delivering during these dates.'}))}))};
 expect(()=>validateDailyAnalysis(bad,dailyEvidence(unknown))).toThrow('missing reporting row');
});

it('accepts a missing-data disclaimer that explicitly says zero delivery is unconfirmed',()=>{
 const unknown={...report,periods:report.periods.map(p=>({...p,totals:null}))};
 const findings=(interpretation:string)=>({periods:answer.periods.map(p=>({...p,findings:p.findings.map(f=>({...f,interpretation}))}))});
 expect(validateDailyAnalysis(findings('A missing reporting row does not prove zero spend or zero delivery.'),dailyEvidence(unknown))).toHaveLength(2);
 expect(validateDailyAnalysis(findings('Zero delivery cannot be confirmed from these imported metrics.'),dailyEvidence(unknown))).toHaveLength(2);
 expect(()=>validateDailyAnalysis(findings('The cause is unknown. No ads were delivering.'),dailyEvidence(unknown))).toThrow('missing reporting row');
});

it('accepts a zero-delivery finding scoped to cited zero campaigns while the account has spend',()=>{
 const scoped={...report,periods:report.periods.map(p=>({...p,campaigns:[{id:'paused',name:'Paused campaign',status:'PAUSED',objective:'OUTCOME_SALES',hasInsights:true,start:null,stop:null,settings:undefined,...metrics({spend:'0',impressions:'0'})}]}))};
 const raw={periods:answer.periods.map(p=>({...p,findings:p.findings.map(f=>({...f,interpretation:'The paused campaign shows explicit zero spend and zero delivery.',evidenceIds:[p.periodId+':campaign:paused:spend',p.periodId+':campaign:paused:impressions']}))}))};
 expect(validateDailyAnalysis(raw,dailyEvidence(scoped))).toHaveLength(2);
 const delivered={...scoped,periods:scoped.periods.map(p=>({...p,campaigns:p.campaigns.map(c=>({...c,impressions:10}))}))};
 expect(()=>validateDailyAnalysis(raw,dailyEvidence(delivered))).toThrow('missing reporting row');
});

it('labels an unreported outcome as an import gap instead of a recording failure',()=>{
 const evidence=dailyEvidence(report);
 const findings=(title:string)=>({periods:answer.periods.map(p=>({...p,findings:p.findings.map(f=>({...f,title,interpretation:'This metric was not returned in the imported evidence.',evidenceIds:[p.periodId+':account:facebookVisits']}))}))});
 expect(()=>validateDailyAnalysis(findings('Facebook profile-visit campaign not recording profile visits'),evidence)).toThrow('recording or tracking failure');
 expect(validateDailyAnalysis(findings('Facebook Page visits unavailable in imported data'),evidence)).toHaveLength(2);
});
