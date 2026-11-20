import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {runReportSkill} from '../lib/skills/report-runner';
import {getReportingSkills} from '../lib/skills/report-packages';
import {dailyEvidence,validateDailyAnalysis} from '../lib/reports/daily-analysis';
import {metrics,joinCampaigns,type Report} from '../lib/reports/model';
import {describeDailyFailure} from '../lib/reports/daily-failure';
import {ReportModelError,ReportSkillError} from '../lib/skills/report-errors';
const api=vi.hoisted(()=>({model:vi.fn(),put:vi.fn()}));
vi.mock('../lib/ai/bedrock',()=>({invokeReportModel:api.model}));
vi.mock('@vercel/blob',()=>({put:api.put}));
const window={since:'2026-11-13',until:'2026-11-19'};
const account={id:'act_2036318527081035',name:'Victoria Harbor Cafe',currency:'USD',status:1};
const report:Report={account,generated:'2026-11-20',periods:[{window,notes:[],totals:metrics({spend:'23.04',impressions:'1000'}),campaigns:joinCampaigns([],[{campaign_id:'fb',campaign_name:'VHC - Boost - Facebook - Profile Visits - 29-10-26',objective:'LINK_CLICKS',spend:'23.04',results:[{indicator:'page_visit_view',values:[{value:'90'}]}]}],window)}]};
const finding=(interpretation:string,title='Facebook Page visits reported',evidenceIds=['window0:campaign:fb:facebookVisits','window0:campaign:fb:cost-per-result'])=>({periods:[{periodId:'window0',findings:[{tone:'ok',category:'win',title,interpretation,evidenceIds,action:'Review the next creative test',reason:'Compare visit quality with the business goal.'}]}]});
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('BEDROCK_MODEL_ID','test-model');api.put.mockResolvedValue({etag:'ok'});});
afterEach(()=>vi.unstubAllEnvs());

it('accepts ordinary correct VHC metric wording and dated period labels without requiring placeholder syntax',()=>{
 const evidence=dailyEvidence(report);
 const result=validateDailyAnalysis(finding('Facebook Page visits: 90 at $0.26 each during this 7-day review.'),evidence);
 expect(result[0].findings[0].interpretation).toContain('90 at $0.26');
 expect(()=>validateDailyAnalysis(finding('Facebook Page visits: 999 at $0.01 each during this 7-day review.'),evidence)).toThrow('Unbound numeric');
 expect(()=>validateDailyAnalysis(finding('100 purchases were reported.','Purchases reported',['window0:account:spend']),evidence)).toThrow('Unbound numeric');
});

it('distinguishes proposed creative counts from claimed historical outcomes',()=>{
 const raw=finding('Facebook Page visits: 90.');raw.periods[0].findings[0].action='Test 2 new creatives';
 expect(validateDailyAnalysis(raw,dailyEvidence(report))[0].findings[0].action).toBe('Test 2 new creatives');
});

it('keeps the outcome type and currency display precision when accepting literal values',()=>{
 const evidence=dailyEvidence(report);
 expect(()=>validateDailyAnalysis(finding('CPL is $0.26.'),evidence)).toThrow('Unbound numeric');
 const pk={...report,account:{...account,currency:'PKR'},periods:report.periods.map(p=>({...p,totals:metrics({spend:'7511.34',purchase_roas:[{action_type:'purchase',value:'.29'}]})}))};
 const raw=finding('Spend was ₨7,511, and ROAS is below 1×.','Attributed value below spend',['window0:account:spend','window0:account:roas']);
 expect(validateDailyAnalysis(raw,dailyEvidence(pk))[0].findings[0].interpretation).toContain('₨7,511');
 expect(()=>validateDailyAnalysis(finding('ROAS is above 1×.','Revenue comparison',['window0:account:roas']),dailyEvidence(pk))).toThrow('Unbound numeric');
});

it('includes the rejected answer and exact validation reason in its repair request',async()=>{
 const invalid=finding('Facebook Page visits: 999.'),valid=finding('Facebook Page visits: 90.');
 api.model.mockResolvedValueOnce(invalid).mockResolvedValueOnce(valid);
 const evidence=dailyEvidence(report),result=await runReportSkill(getReportingSkills()[0],evidence,raw=>validateDailyAnalysis(raw,evidence));
 expect(result.output[0].findings[0].interpretation).toBe('Facebook Page visits: 90.');
 const repair=JSON.parse(api.model.mock.calls[1][1]);
 expect(repair.repair.previousResponseExcerpt).toContain('999');expect(repair.repair.validation).toContain('999');
 expect(api.put.mock.calls.every(c=>c[2].access==='private')).toBe(true);
});

it('retries a malformed or truncated model response instead of immediately pausing the job',async()=>{
 api.model.mockRejectedValueOnce(new ReportModelError('model_response','Truncated response')).mockResolvedValueOnce(finding('Facebook Page visits: 90.'));
 const evidence=dailyEvidence(report);
 expect((await runReportSkill(getReportingSkills()[0],evidence,raw=>validateDailyAnalysis(raw,evidence))).output).toHaveLength(1);
 expect(api.model).toHaveBeenCalledTimes(2);
});

it('retains failed output privately with a safe reference and exposes a useful stage without raw credentials',async()=>{
 api.model.mockResolvedValue(finding('Facebook Page visits: 999.'));
 const evidence=dailyEvidence(report);let error:unknown;
 try{await runReportSkill(getReportingSkills()[0],evidence,raw=>validateDailyAnalysis(raw,evidence));}catch(e){error=e;}
 expect(error).toBeInstanceOf(ReportSkillError);
 const failed=JSON.parse(api.put.mock.calls[0][1]);expect(failed.status).toBe('failed');expect(failed.attempts).toHaveLength(2);
 const publicFailure=describeDailyFailure('analysis',error);expect(publicFailure.code).toBe('analysis_validation');expect(publicFailure.runId).toBe(failed.reference);
 expect(JSON.stringify(describeDailyFailure('evidence',Object.assign(Error('Bearer secret-token'),{status:403})))).not.toContain('secret-token');
 expect(describeDailyFailure('evidence',Object.assign(Error('Denied'),{status:403})).code).toBe('meta_access');
});
