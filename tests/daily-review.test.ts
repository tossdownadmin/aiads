import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {dailyEvidence,partitionDailyEvidence,analyzeDailyReport,validateDailyAnalysis,DailyReviewProgress,type DailyReviewCheckpoint} from '../lib/reports/daily-analysis';
import {dailyWindows,previousWindow,shiftDay,metrics,joinCampaigns,type Report} from '../lib/reports/model';
import {getReportingSkills} from '../lib/skills/report-packages';

const api=vi.hoisted(()=>({fetch:vi.fn(),campaigns:vi.fn(),details:vi.fn(),model:vi.fn(),put:vi.fn()}));
vi.mock('../lib/meta/read',()=>({fetchAllPages:api.fetch,getCampaigns:api.campaigns}));
vi.mock('../lib/meta/campaign-detail',async importOriginal=>({...await importOriginal<typeof import('../lib/meta/campaign-detail')>(),readDetails:api.details}));
vi.mock('../lib/ai/bedrock',()=>({invokeReportModel:api.model}));
vi.mock('@vercel/blob',()=>({put:api.put}));
import {readDailyReview} from '../lib/reports/read';

const account={id:'act_123',name:'Test',currency:'CAD',status:1};
const windows=dailyWindows('2026-11-19','2026-11-20');
const campaign=(id:string)=>({campaign_id:id,campaign_name:'Campaign '+id,objective:'OUTCOME_LEADS',spend:'100',impressions:'10000',actions:[{action_type:'lead',value:'5'}]});
const makeReport=(number=1):Report=>({account,generated:'2026-11-20',periods:windows.map(window=>({window,totals:metrics({spend:'100',impressions:'10000'}),campaigns:joinCampaigns([],Array.from({length:number},(_,i)=>campaign(String(i))),window,new Map(Array.from({length:number},(_,i)=>[String(i),{goals:['LEAD_GENERATION'],bids:[],primary:{metric:'leads',label:'Leads',scale:'1'}}]))),notes:[]}))});
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('BEDROCK_MODEL_ID','test-model');api.put.mockResolvedValue({etag:'v1'});api.campaigns.mockResolvedValue([]);api.details.mockImplementation(async(_a,_c,_ids,periods)=>periods.map(()=>({})));});
afterEach(()=>vi.unstubAllEnvs());

it('uses inclusive, equal-duration immediately preceding windows across month and leap boundaries',()=>{
 expect(previousWindow(windows[0])).toEqual({since:'2026-11-06',until:'2026-11-12'});
 expect(previousWindow(windows[1])).toEqual({since:'2026-09-21',until:'2026-10-20'});
 expect(previousWindow({since:'2024-03-01',until:'2024-03-07'})).toEqual({since:'2024-02-23',until:'2024-02-29'});
});

it('fetches previous campaign identities, rolls up primary Page visits once, and enables dated ad reads',async()=>{
 api.fetch.mockImplementation(async(path,params)=>{
  if(path.endsWith('/adsets'))return [];
  if(params.level==='adset')return [{campaign_id:'0',adset_id:'s',results:[{indicator:'page_visit_view',values:[{value:'90'}]}]}];
  return params.level==='campaign'?[campaign('0')]:[{spend:'100',impressions:'10000'}];
 });
 const periods=await readDailyReview(account,windows);
 expect(api.details.mock.calls[0][4]).toBe(true);
 expect(periods[0].previous?.window).toEqual(previousWindow(windows[0]));
 expect(periods[0].previous?.campaigns[0].facebookVisits).toBe(90);
 expect(periods[0].previous?.campaigns[0].id).toBe('0');
 expect(periods[0].reviewNotes?.join(' ')).toMatch(/No approved.*targets|No approved monthly budget/);
});

it('only calculates pacing for a matching approved month and currency, and distinguishes a denied comparison from zero',async()=>{
 api.fetch.mockImplementation(async(path,params)=>{
  if(path.endsWith('/adsets'))return [];
  const window=JSON.parse(params.time_range);
  if(window.until==='2026-11-12')throw Object.assign(Error('Permission denied'),{status:403});
  return params.level==='campaign'?[]:[{spend:'190',impressions:'10000'}];
 });
 const context={accountId:account.id,businessGoal:'Acquire leads',targetOwner:'Account lead',approvedOn:'2026-11-01',validUntil:'2026-11-30',targetCpl:20,monthlyBudget:300,budgetMonth:'2026-11',currency:'CAD',updatedAt:'2026-11-20'};
 const periods=await readDailyReview(account,windows,context as any);
 expect(periods[0].pacing).toMatchObject({spent:190,budget:300,elapsedDays:19,monthDays:30,expectedSpend:190,projectedSpend:300});
 expect(periods[0].previous?.totals).toBeNull();
 expect(periods[0].reviewNotes?.join(' ')).toContain('Meta denied access');
 expect((await readDailyReview(account,windows,{...context,budgetMonth:'2026-10'} as any))[0].pacing).toBeUndefined();
 expect((await readDailyReview(account,windows,{...context,currency:'USD'} as any))[0].pacing).toBeUndefined();
 expect((await readDailyReview(account,windows,{...context,validUntil:'2026-11-01'} as any))[0].pacing).toBeUndefined();
 expect((await readDailyReview(account,windows,{...context,targetOwner:''} as any))[0].pacing).toBeUndefined();
});

it('supplies every returned ad and ad-set, correctly scoped previous outcomes, and a readable interpretation separate from evidence',()=>{
 const report=makeReport();
 for(const p of report.periods){
  p.previous={window:previousWindow(p.window),totals:p.totals,campaigns:joinCampaigns([],[{...campaign('0'),spend:'50'}],previousWindow(p.window))};
  p.details={'0':{notes:[],sets:[{id:'s',name:'Local',status:'ACTIVE',settings:{Optimization:'LEAD_GENERATION',Platforms:'facebook'},stats:metrics({spend:'100'}),ads:Array.from({length:12},(_,i)=>({id:String(i),name:'Ad '+i,status:'ACTIVE',stats:metrics({spend:String(12-i)}),days:[{day:p.window.until,ctr:'1',cpc:'2',frequency:'1',impressions:'100'}],creative:{id:'c'+i,copy:['Test copy'],titles:[],descriptions:[],links:[],ctas:[],assets:[],post:'',notes:[]}}))}]}};
 }
 const evidence=dailyEvidence(report);
 expect(evidence.periods[0].adCoverage).toMatchObject({supplied:12,adSets:1});
 expect(evidence.facts.find(f=>f.id==='window0:ad:11')).toBeDefined();
 expect(evidence.facts.find(f=>f.id==='window0:campaign:0:change')?.value).toMatchObject({percent:{spend:100,costPerResult:100}});
 const raw={periods:evidence.periods.map(p=>({periodId:p.id,findings:[{tone:'warn',priority:'next',title:'Cost per lead increased',interpretation:'Review the changed delivery before reallocating budget.',action:'Review comparable ads',reason:'Separate a lasting change from a short-term fluctuation.',evidenceIds:[p.id+':campaign:0:change']}]}))};
 const result=validateDailyAnalysis(raw,evidence);
 expect(result[0].findings[0].interpretation).not.toContain('status and objective');
 expect(result[0].findings[0].evidence).toHaveLength(1);
});

it('partitions large accounts without dropping facts and synthesizes validated batches with provenance',async()=>{
 const evidence=dailyEvidence(makeReport(150));
 const batches=partitionDailyEvidence(evidence);
 expect(batches.length).toBeGreaterThan(1);
 const covered=new Set(batches.flatMap(b=>b.facts.map(f=>f.id)));
 expect(covered).toEqual(new Set(evidence.facts.map(f=>f.id)));
 for(const batch of batches){
  const compact={...batch,facts:batch.facts.map(({display,periodId,...f})=>f)};
  expect(JSON.stringify(compact).length).toBeLessThanOrEqual(155000);
 }
 api.model.mockImplementation(async(_system,encoded)=>{
  const supplied=JSON.parse(encoded);
  return {periods:supplied.periods.map((p:any)=>({periodId:p.id,findings:[{tone:'ok',priority:'monitor',title:'Measured delivery returned',interpretation:'Monitor reported outcomes against the agreed goal.',evidenceIds:[p.id+':account:spend'],action:'Review the brief',reason:'No approved target supplied.'}]}))};
 });
 const result=await analyzeDailyReport(makeReport(150),getReportingSkills()[0]);
 expect(result.supportingRuns?.length).toBe(batches.length);
 const final=JSON.parse(api.model.mock.calls.at(-1)![1]);
 expect(final.stage).toBe('final-synthesis');
 expect(final.reviewedBatches).toHaveLength(batches.length);
 expect(result.periods).toHaveLength(2);
 expect(api.put).toHaveBeenCalledTimes((batches.length+1)*3);
});

it.each(['Creative fatigue confirmed','Frequency is the cause','Zero new viewers','Tracking is broken','10 qualified leads generated'])('rejects unsupported sample-style certainty: %s',title=>{
 const evidence=dailyEvidence(makeReport());
 const raw={periods:evidence.periods.map(p=>({periodId:p.id,findings:[{tone:'crit',title,interpretation:'Check the underlying evidence.',evidenceIds:[p.id+':account:spend'],action:'Review',reason:'Review with the client.'}]}))};
 expect(()=>validateDailyAnalysis(raw,evidence)).toThrow();
});

it('resumes persisted batches without rerunning completed reviews and gives synthesis its own request',async()=>{
 const report=makeReport(150),cache=new Map<string,any>();
 const checkpoint:DailyReviewCheckpoint={load:async key=>cache.get(key)??null,save:async(key,value)=>{cache.set(key,value);}};
 api.model.mockImplementation(async(_system,encoded)=>{
  const supplied=JSON.parse(encoded);
  return {periods:supplied.periods.map((p:any)=>({periodId:p.id,findings:[{tone:'ok',category:'observation',title:'Delivery returned',interpretation:'Review against the agreed goal.',evidenceIds:[p.id+':account:spend'],action:'Review the brief',reason:'No approved target supplied.'}]}))};
 });
 const batches=partitionDailyEvidence(dailyEvidence(report));
 let result;
 for(let attempt=0;attempt<batches.length+1&&!result;attempt++){
  const before=api.model.mock.calls.length;
  try{result=await analyzeDailyReport(report,getReportingSkills()[0],checkpoint);}
  catch(error){expect(error).toBeInstanceOf(DailyReviewProgress);expect(api.model.mock.calls.length-before).toBeLessThanOrEqual(2);}
 }
 expect(result?.periods).toHaveLength(2);
 expect(api.model).toHaveBeenCalledTimes(batches.length+1);
 expect(cache.size).toBe(batches.length);
 expect(JSON.parse(api.model.mock.calls.at(-1)![1]).stage).toBe('final-synthesis');
});

it('binds quantitative prose to supplied scalar facts and rejects arbitrary numbers and false title claims',()=>{
 const evidence=dailyEvidence(makeReport());
 const raw=(title:string,interpretation:string,evidenceIds=['window0:account:spend'])=>({periods:evidence.periods.map((p,i)=>({periodId:p.id,findings:[{tone:'warn',title,interpretation:interpretation.replaceAll('window0','window'+i),evidenceIds:evidenceIds.map(id=>id.replace('window0','window'+i)),action:'Review the goal',reason:'Confirm the expected outcome.'}]}))});
 expect(()=>validateDailyAnalysis(raw('Excellent purchases','999 purchases at a CPA of CAD 0.01.'),evidence)).toThrow('numeric');
 expect(()=>validateDailyAnalysis(raw('Zero delivery','Review the schedule.'),evidence)).toThrow('zero delivery');
 expect(validateDailyAnalysis(raw('Measured purchases','Purchases: {{window0:account:purchases}}.', ['window0:account:purchases']),evidence)[0].findings[0].interpretation).toBe('Purchases: Not reported.');
 const bound=validateDailyAnalysis(raw('Measured spend','Spend was {{window0:account:spend}}.'),evidence);
 expect(bound[0].findings[0].interpretation).toBe('Spend was CAD $100.00.');
 expect(bound[1].findings[0].interpretation).toBe('Spend was CAD $100.00.');
});

it('preserves a supporting batch limitation through the final synthesis and persisted provenance',async()=>{
 api.model.mockImplementation(async(_system,encoded)=>{
  const supplied=JSON.parse(encoded);
  return {periods:supplied.periods.map((p:any)=>({periodId:p.id,findings:[
   {tone:'ok',title:'Measured delivery',interpretation:'Spend was {{'+p.id+':account:spend}}.',evidenceIds:[p.id+':account:spend'],action:'Review the brief',reason:'No target was supplied.'},
   ...supplied.stage==='final-synthesis'?[]:[{tone:'warn',title:'Unverified numeric trend',interpretation:'CTR remained above 6% on most days.',evidenceIds:[p.id+':account:spend'],action:'Review',reason:'Confirm before acting.'}],
  ]}))};
 });
 const result=await analyzeDailyReport(makeReport(150),getReportingSkills()[0]);
 expect(result.supportingRuns!.every(run=>run.reviewStatus==='limited')).toBe(true);
 expect(result.run.reviewStatus).toBe('limited');
 expect(result.periods.every(p=>p.notes?.some(n=>n.includes('Supporting AI reviews omitted')))).toBe(true);
 expect(result.periods.every(p=>p.findings.length===1)).toBe(true);
 const saved=JSON.parse(api.put.mock.calls.at(-2)![1]);
 expect(saved.validation.status).toBe('limited');expect(saved.output[0].notes).toBeDefined();
});

it('bounds final synthesis for hundreds of fully dated ads and retains campaign-zero guard dependencies',async()=>{
 const report=makeReport(80);
 for(const p of report.periods){
  p.campaigns[0]={...p.campaigns[0],spend:0,impressions:0};
  const count=Math.round((Date.parse(p.window.until)-Date.parse(p.window.since))/86400000)+1;
  p.details={'0':{notes:[],sets:[{id:'s',name:'Audience',status:'ACTIVE',settings:{Optimization:'LEAD_GENERATION'},ads:Array.from({length:320},(_,i)=>({id:'ad'+i,name:'Ad '+i,status:'ACTIVE',stats:metrics({spend:'10',impressions:'1000',actions:[{action_type:'lead',value:'1'}]}),days:Array.from({length:count},(_,d)=>({day:shiftDay(p.window.since,d),spend:'2.34',clicks:'10',purchases:0,leads:1,ctr:'1.2345',cpc:'0.234',frequency:'1.23',impressions:'1000'})),creative:{id:'creative'+i,copy:['Copy '.repeat(60)],titles:[],descriptions:[],links:[],ctas:[],assets:[],post:'',notes:[]}}))}]}};
 }
 api.model.mockImplementation(async(_system,encoded)=>{
  const supplied=JSON.parse(encoded);expect(encoded.length).toBeLessThan(240000);
  return {periods:supplied.periods.map((p:any)=>{
   const ads=supplied.facts.filter((f:any)=>f.id.startsWith(p.id+':ad:')).slice(0,5);
   return {periodId:p.id,findings:[{tone:'warn',category:'concern',title:'Ad review needed',interpretation:'Review comparable ad outcomes.',evidenceIds:ads.length?ads.map((f:any)=>f.id):[p.id+':account:spend'],action:'Review the creative test',reason:'Check the measured outcomes before changing the budget.'},...(supplied.facts.some((f:any)=>f.id===p.id+':campaign:0:spend')?[{tone:'warn',title:'Zero delivery',interpretation:'Explicit zero spend and zero delivery for the cited campaign.',evidenceIds:[p.id+':campaign:0:spend'],action:'Check the schedule',reason:'Confirm whether this was intentional.'}]:[])]};
  })};
 });
 const result=await analyzeDailyReport(report,getReportingSkills()[0]);
 expect(result.supportingRuns!.length).toBeGreaterThan(2);
 const final=JSON.parse(api.model.mock.calls.at(-1)![1]);
 expect(final.stage).toBe('final-synthesis');expect(JSON.stringify(final).length).toBeLessThanOrEqual(220000);
 for(const p of final.periods)if(final.facts.some((f:any)=>f.id===p.id+':campaign:0:spend'))expect(final.facts.some((f:any)=>f.id===p.id+':campaign:0:impressions')).toBe(true);
});

it('retains a verified final window and reuses only cited supporting reviews for a rejected synthesis window',async()=>{
  api.model.mockImplementation(async(_system,encoded)=>{
    const data=JSON.parse(encoded), final=data.stage==='final-synthesis';
    return {periods:data.periods.map((p:{id:string})=>({
      periodId:p.id,findings:[{tone:'ok',category:'observation',title:final?'Final delivery review':'Supporting spend review',
        interpretation:final&&p.id==='window1'?'Delivery exceeded the 999 purchase threshold.':'Spend was {{'+p.id+':account:spend}}.',
        evidenceIds:[p.id+':account:spend'],action:'Check dated delivery',reason:'Confirm the scheduled flight.'}]
    }))};
  });
  const result=await analyzeDailyReport(makeReport(150),getReportingSkills()[0]);
  expect(result.run.reviewStatus).toBe('limited');
  expect(result.periods.map(p=>p.findings.map(f=>f.title))).toEqual([['Final delivery review'],['Supporting spend review']]);
  expect(result.periods[1].findings[0].interpretation).toBe('Spend was CAD $100.00.');
  const details=JSON.parse(api.put.mock.calls.at(-2)![1]).validation.details;
  expect(details.reused).toEqual([{periodId:'window1',runIds:[expect.any(String)]}]);
  expect(result.supportingRuns?.some(r=>r.id===details.reused[0].runIds[0])).toBe(true);
});
