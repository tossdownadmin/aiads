import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {analyzeDailyReport,dailyEvidence,recoverDailyFindings,validateDailyAnalysis} from '../lib/reports/daily-analysis';
import {dailyWindows,metrics,joinCampaigns,type Report} from '../lib/reports/model';
import {getReportingSkills} from '../lib/skills/report-packages';
import {renderDailyDocument} from '../lib/reports/daily-document';

const api=vi.hoisted(()=>({model:vi.fn(),put:vi.fn()}));
vi.mock('../lib/ai/bedrock',()=>({invokeReportModel:api.model}));
vi.mock('@vercel/blob',()=>({put:api.put}));
const report:Report={account:{id:'act_test',name:'Synthetic test account',currency:'CAD',status:1},generated:'2026-11-20',periods:dailyWindows('2026-11-19','2026-11-20').map(window=>({window,notes:[],totals:metrics({spend:'100',impressions:'10000',actions:[{action_type:'lead',value:'5'}]}),campaigns:[]}))};
const finding=(id:string,interpretation='Spend was {{'+id+':account:spend}}.',title='Measured delivery')=>({tone:'ok',category:'observation',title,interpretation,evidenceIds:[id+':account:spend'],action:'Review the client goal',reason:'No approved target supplied.'});
const answer=()=>({periods:['window0','window1'].map(id=>({periodId:id,findings:[finding(id),finding(id,'CTR remained above 6% on most days.','Daily engagement comparison')]}))});
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('BEDROCK_MODEL_ID','synthetic-model');api.put.mockResolvedValue({etag:'ok'});});
afterEach(()=>vi.unstubAllEnvs());

it('keeps verified findings after two rejected answers and exposes omissions in the rendered report and private record',async()=>{
 api.model.mockResolvedValue(answer());
 const analysis=await analyzeDailyReport(report,getReportingSkills()[0]);
 expect(api.model).toHaveBeenCalledTimes(2);expect(analysis.run.reviewStatus).toBe('limited');
 for(const p of analysis.periods){expect(p.findings).toHaveLength(1);expect(p.notes?.[0]).toContain('1 proposed observation was omitted');expect(p.findings[0].interpretation).toBe('Spend was CAD $100.00.');}
 const updated={...report,periods:report.periods.map((p,i)=>({...p,analysis:analysis.periods[i]}))};
 const html=renderDailyDocument([{account:report.account,report:updated}],'2026-11-19');
 expect(html).toContain('AI review with limitations');expect(html).not.toContain('CTR remained above 6%');expect(html).toContain('Measured delivery');
 const output=JSON.parse(api.put.mock.calls.find(c=>String(c[0]).endsWith('/output.json'))![1]);
 expect(output.validation.status).toBe('limited');expect(output.validation.details.rejected).toHaveLength(2);expect(output.validation.attempts).toHaveLength(2);
 expect(api.put.mock.calls.every(c=>c[2].access==='private')).toBe(true);
});

it('prefers the newest verified wording and recovers an older valid observation if its replacement fails',()=>{
 const older=answer(),newer=answer();
 older.periods[0].findings[0].interpretation='Earlier measured review.';
 newer.periods[0].findings[0].interpretation='999 purchases were reported.';
 newer.periods[1].findings[0].interpretation='Newest measured review.';
 const result=recoverDailyFindings([older,newer],dailyEvidence(report));
 expect(result.periods[0].findings[0].interpretation).toBe('Earlier measured review.');
 expect(result.periods[1].findings[0].interpretation).toBe('Newest measured review.');
 expect(result.rejected.map(f=>f.title)).toEqual(['Daily engagement comparison','Daily engagement comparison']);
});

it('does not convert invalid schema or unknown, duplicate or incomplete windows into successful account coverage',()=>{
 const evidence=dailyEvidence(report);
 const bad=[{periods:[]},{periods:[answer().periods[0]]},{periods:[answer().periods[0],answer().periods[0]]},{periods:[answer().periods[0],{...answer().periods[1],periodId:'invented'}]}];
 for(const response of bad)expect(()=>recoverDailyFindings([response],evidence)).toThrow('No verified AI finding');
 const unsupported=answer();unsupported.periods[1].findings=[finding('window1','999 purchases were reported.')];
 expect(()=>recoverDailyFindings([unsupported],evidence)).toThrow('window1');
});

it('does not reintroduce a renamed observation from an older draft once the newer window has verified findings',()=>{
 const older=answer(),newer=answer();
 older.periods[0].findings[0].title='Earlier title with a broader claim';
 newer.periods[0].findings[0].title='Corrected narrower observation';
 const recovered=recoverDailyFindings([older,newer],dailyEvidence(report));
 expect(recovered.periods[0].findings).toHaveLength(1);
 expect(recovered.periods[0].findings[0].title).toBe('Corrected narrower observation');
});

it('retains exact failed input as well as responses when no verified finding covers a window',async()=>{
 const response=answer();response.periods[1].findings=[finding('window1','999 purchases were reported.')];api.model.mockResolvedValue(response);
 await expect(analyzeDailyReport(report,getReportingSkills()[0])).rejects.toMatchObject({code:'analysis_validation'});
 const stored=api.put.mock.calls.map(c=>({path:String(c[0]),value:JSON.parse(c[1])}));
 expect(stored.find(r=>r.path.endsWith('/evidence.json'))?.value).toEqual(JSON.parse(api.model.mock.calls[0][1]));
 expect(stored.find(r=>r.path.endsWith('/output.json'))?.value.status).toBe('failed');
 expect(stored.some(r=>r.path.endsWith('/skill.json'))).toBe(false);
});

it('rejects complex placeholders and unsupported thresholds without dropping the verified scalar observation',()=>{
 const response=answer(),evidence=dailyEvidence(report);
 for(const p of response.periods){
  evidence.facts.push({id:p.periodId+':ad:example',periodId:p.periodId,value:{stats:{spend:100}},display:'Test ad — ad performance: returned'});
  p.findings.push({...finding(p.periodId,'Spend was {{'+p.periodId+':ad:example}}.','Whole-object placeholder'),evidenceIds:[p.periodId+':ad:example']});
  p.findings.push(finding(p.periodId,'Frequency remains below the 3.5 warning threshold.','Unverified threshold comparison'));
 }
 const result=recoverDailyFindings([response],evidence);
 expect(result.periods.every(p=>p.findings.length===1)).toBe(true);expect(result.rejected).toHaveLength(6);
});

it('supplies result labels to the model and rejects substituting cost per reach for cost per ThruPlay',async()=>{
 const sample={...report,periods:report.periods.map(p=>({...p,campaigns:joinCampaigns([],[{campaign_id:'video',campaign_name:'Video awareness',objective:'OUTCOME_AWARENESS',spend:'100',reach:'5000',actions:[{action_type:'video_thruplay_watched_actions',value:'1000'}],video_thruplay_watched_actions:[{action_type:'video_view',value:'1000'}]}],p.window)}))};
 const evidence=dailyEvidence(sample),cost=evidence.facts.find(f=>f.id==='window0:campaign:video:cost-per-result')!;
 expect(cost.display).toContain('ThruPlays');
 const response=answer();for(const p of response.periods)p.findings=[{...finding(p.periodId,'Measured cost was {{'+p.periodId+':campaign:video:cost-per-result}} cost per reach.'),evidenceIds:[p.periodId+':campaign:video:cost-per-result']}];
 expect(()=>validateDailyAnalysis(response,evidence)).toThrow('cost per ThruPlay');
 api.model.mockResolvedValue({periods:response.periods.map(p=>({...p,findings:[finding(p.periodId)]}))});
 await analyzeDailyReport(sample,getReportingSkills()[0]);
 const sent=JSON.parse(api.model.mock.calls[0][1]);expect(sent.facts.find((f:any)=>f.id===cost.id).label).toBe('cost per ThruPlays');
});

// The private attachment stays outside the repository. Synthetic evidence only
// replays response parsing/filtering; these are not verified live Meta values.
it.runIf(!!process.env.AIADS_FAILED_OUTPUT_FIXTURE)('replays both attached production responses against an explicitly synthetic evidence catalog',()=>{
 const failed=JSON.parse(readFileSync(process.env.AIADS_FAILED_OUTPUT_FIXTURE!,'utf8'));
 const responses=failed.attempts.map((a:any)=>a.response),evidence=dailyEvidence(report);
 const references=new Set<string>(responses.flatMap((r:any)=>r.periods.flatMap((p:any)=>p.findings.flatMap((f:any)=>f.evidenceIds))));
 for(const id of references){
  if(evidence.facts.some(f=>f.id===id))continue;
  const periodId=id.split(':')[0],metric=id.split(':').at(-1)!;
  const complex=['change','previous-window'].includes(metric)||/:(?:ad|adset):/.test(id);
  const label=metric==='cost-per-result'?'cost per '+(id.includes('120251661321750267')?'ThruPlays':'Instagram profile visits'):metric;
  evidence.facts.push({id,periodId,value:complex?{}:12,display:'Synthetic evidence — '+label+': '+(complex?'Synthetic object':'12')});
 }
 for(const response of responses)expect(()=>validateDailyAnalysis(response,evidence)).toThrow();
 const result=recoverDailyFindings(responses,evidence);
 expect(result.periods).toHaveLength(2);expect(result.periods.every(p=>p.findings.length>=3)).toBe(true);
 expect(result.rejected.some(r=>r.reason.includes('6%'))).toBe(true);
 expect(result.rejected.some(r=>r.reason.includes('ThruPlay'))).toBe(true);
 expect(result.periods.every(p=>p.notes?.length)).toBe(true);
});
