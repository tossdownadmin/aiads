import {beforeEach,expect,it,vi} from 'vitest';
import {comparisonWindow,metrics} from '../lib/reports/model';
import {getReportingSkills,skillVersion} from '../lib/skills/report-packages';
const api=vi.hoisted(()=>({auth:vi.fn(),get:vi.fn(),head:vi.fn(),put:vi.fn(),accounts:vi.fn(),windows:vi.fn(),skill:vi.fn(),analyze:vi.fn(),context:vi.fn()}));
vi.mock('../lib/auth',()=>({verifyAdminSession:api.auth}));
vi.mock('../lib/meta/read',()=>({getAdAccounts:api.accounts}));
vi.mock('../lib/reports/read',()=>({readDailyReview:api.windows}));
vi.mock('../lib/reports/client-context',()=>({readClientContext:api.context}));
vi.mock('../lib/skills/report-runner',()=>({selectReportSkill:api.skill}));
vi.mock('../lib/reports/daily-analysis',async importOriginal=>({...await importOriginal<typeof import('../lib/reports/daily-analysis')>(),analyzeDailyReport:api.analyze}));
vi.mock('@vercel/blob',()=>({get:api.get,head:api.head,put:api.put,BlobNotFoundError:class extends Error{},BlobPreconditionFailedError:class extends Error{}}));
import {GET,POST} from '../app/api/meta/reports/daily/route';
import {BlobNotFoundError,BlobPreconditionFailedError} from '@vercel/blob';
import {DailyReviewProgress} from '../lib/reports/daily-analysis';
const account={id:'act_123',name:'Test client',currency:'CAD',status:1,timezone:'America/Toronto'};
const approvedContext={accountId:account.id,currency:account.currency,businessGoal:'Acquire qualified inquiries',qualificationNotes:'Team-reported quote requests',targetCpl:20,monthlyBudget:500,budgetMonth:'2025-01',updatedAt:'2025-01-09T00:00:00Z'};
const old={date:'2025-01-10',accountIds:[account.id],html:'previous',savedAt:'2025-01-11T00:00:00Z'};
const savedPath='reports/daily/latest-v1.json',pending='reports/daily/pending-v1.json';
const blobs=new Map<string,{value:any;version:string}>();let number=0;
const post=(body:unknown)=>POST(new Request('https://example.com/api/meta/reports/daily',{method:'POST',body:JSON.stringify(body)}));
async function start(extra={}){return (await (await post({action:'start',version:'v1',accountIds:[account.id],...extra})).json()).job;}
beforeEach(()=>{
 vi.resetAllMocks();blobs.clear();number=1;blobs.set(savedPath,{value:structuredClone(old),version:'v1'});
 api.auth.mockResolvedValue(true);api.accounts.mockResolvedValue([account]);api.skill.mockResolvedValue(getReportingSkills()[0]);api.context.mockResolvedValue(null);
 api.head.mockImplementation(async(path:string)=>{const b=blobs.get(path);if(!b)throw new BlobNotFoundError();return {etag:b.version};});
 api.get.mockImplementation(async(path:string)=>({stream:new Response(JSON.stringify(blobs.get(path)!.value)).body}));
 api.put.mockImplementation(async(path:string,body:string,options:any)=>{const current=blobs.get(path);if((options.ifMatch&&options.ifMatch!==current?.version)||(!options.allowOverwrite&&current))throw new BlobPreconditionFailedError();const version='v'+(++number);blobs.set(path,{value:JSON.parse(body),version});return {etag:version};});
 api.windows.mockImplementation(async(_a,windows)=>windows.map((window:any)=>({window,campaigns:[],totals:metrics({spend:0,impressions:0}),notes:[]})));
 api.analyze.mockImplementation(async(report,skill)=>({run:{id:'analysis',skill:skillVersion(skill),model:'unit-model',evidenceHash:'hash',evidencePath:'private/input',outputPath:'private/output',completedAt:'2026-11-20'},periods:report.periods.map((_p:any,i:number)=>({periodId:'window'+i,findings:[{tone:'warn',title:'Skill finding',detail:'Cited observation',action:'Review delivery',reason:'Check the intended schedule'}]}))}));
});
it('opens the saved report without calling Meta or Claude and authenticates mutations',async()=>{
 expect((await (await GET()).json()).saved.html).toBe('previous');expect(api.accounts).not.toHaveBeenCalled();expect(api.analyze).not.toHaveBeenCalled();api.auth.mockResolvedValue(false);expect((await GET()).status).toBe(401);expect((await post({})).status).toBe(401);
});
it('starts a pinned resumable job without replacing the saved report',async()=>{
 const job=await start();expect(job.done).toBe(0);expect(job.skill.name).toBe('daily-meta-review');expect(blobs.get(savedPath)!.value.html).toBe('previous');expect(api.analyze).not.toHaveBeenCalled();
 expect((await post({action:'start',version:'v1'})).status).toBe(409);expect((await post({action:'start',version:'stale'})).status).toBe(409);
});
it('publishes only a fully analyzed report, retains provenance and does not rerun a completed job',async()=>{
 const job=await start();const response=await post({action:'advance',jobId:job.id}),body=await response.json();expect(response.status).toBe(200);expect(body.saved.html).toContain('Skill finding');expect(body.saved.runs).toHaveLength(1);expect(body.saved.skill.name).toBe('daily-meta-review');
 expect(api.put.mock.calls.find(c=>c[0]===savedPath)?.[2]).toMatchObject({access:'private',ifMatch:'v1'});expect(api.analyze).toHaveBeenCalledTimes(1);await post({action:'advance',jobId:job.id});expect(api.analyze).toHaveBeenCalledTimes(1);
 expect(api.analyze.mock.calls[0][0].reviewContext).toBeNull();
});
it('keeps the last report and retries saved context after an outage without caching missing targets',async()=>{
 const job=await start({date:'2025-01-10'});
 const privateFailure='Blob unavailable; Bearer private-token';
 api.context.mockRejectedValueOnce(Error(privateFailure));
 const response=await post({action:'advance',jobId:job.id}),failure=await response.json();
 expect(response.status).toBe(200);expect(failure.job.status).toBe('failed');expect(failure.job.done).toBe(0);
 expect(failure.job.error).toContain('Saved business context could not be loaded');expect(failure.job.error).toContain('Resume to retry');
 expect(JSON.stringify(failure)).not.toContain(privateFailure);
 expect(blobs.get(savedPath)).toEqual({value:old,version:'v1'});
 const inputPath='reports/daily/jobs/'+job.id+'/'+account.id+'-input.json';
 expect(blobs.has(inputPath)).toBe(false);expect(api.windows).not.toHaveBeenCalled();expect(api.analyze).not.toHaveBeenCalled();

 api.context.mockResolvedValue(approvedContext);
 const resumed=await (await post({action:'advance',jobId:job.id})).json();
 expect(resumed.job.status).toBe('complete');expect(resumed.saved.html).toContain('Skill finding');
 expect(api.context).toHaveBeenCalledTimes(2);
 expect(api.analyze.mock.calls[0][0].reviewContext).toEqual(approvedContext);
 expect(blobs.get(inputPath)!.value.report.reviewContext).toEqual(approvedContext);
});
it('retains the last report after a model failure and resumes the pending account',async()=>{
 const job=await start();api.analyze.mockRejectedValueOnce(Error('model unavailable'));const failure=await (await post({action:'advance',jobId:job.id})).json();expect(failure.job.status).toBe('failed');expect(blobs.get(savedPath)!.value.html).toBe('previous');
 const success=await (await post({action:'advance',jobId:job.id})).json();expect(success.saved.html).toContain('Skill finding');
});
it('processes one account per batch and preserves completed accounts across resume',async()=>{
 api.accounts.mockResolvedValue([account,{...account,id:'act_456',name:'Second'}]);const job=await start({accountIds:['act_123','act_456'],date:'2025-01-10'});const first=await (await post({action:'advance',jobId:job.id})).json();expect(first.job.done).toBe(1);expect(first.saved).toBeUndefined();expect(blobs.get(savedPath)!.value.html).toBe('previous');
 const second=await (await post({action:'advance',jobId:job.id})).json();expect(second.saved.accountIds).toEqual(['act_123','act_456']);expect(api.analyze).toHaveBeenCalledTimes(2);
});
it('honors active worker leases, rejects a stale final save and allows explicit discard',async()=>{
 const job=await start();const row=blobs.get(pending)!;row.value.lease={token:'worker',until:Date.now()+60000};const waiting=await (await post({action:'advance',jobId:job.id})).json();expect(waiting.processing).toBe(true);expect(api.analyze).not.toHaveBeenCalled();expect((await post({action:'discard',jobId:job.id})).status).toBe(409);
 row.value.lease=undefined;api.analyze.mockImplementationOnce(async(report,skill)=>{blobs.set(savedPath,{value:{...old,html:'a teammate saved this'},version:'other'});return {run:{id:'x',skill:skillVersion(skill)},periods:report.periods.map((_p:any,i:number)=>({periodId:'window'+i,findings:[]}))};});expect((await post({action:'advance',jobId:job.id})).status).toBe(409);expect(blobs.get(savedPath)!.value.html).toBe('a teammate saved this');expect((await post({action:'discard',jobId:job.id})).status).toBe(200);
});
it('uses inclusive comparison windows with matched elapsed days',()=>{
 expect(comparisonWindow({since:'2025-01-01',until:'2025-01-11',partial:true})).toEqual({since:'2024-12-01',until:'2024-12-11'});expect(comparisonWindow({since:'2024-03-01',until:'2024-03-31'}).until).toBe('2024-02-29');
});

it('rejects an outdated selected skill version before starting a job',async()=>{
 expect((await post({action:'start',version:'v1',skillSha:'old-version'})).status).toBe(400);expect(api.analyze).not.toHaveBeenCalled();expect(blobs.get(savedPath)!.value.html).toBe('previous');
});

it('persists large-account progress and reuses the exact prepared evidence and context on resume',async()=>{
 const job=await start();
 api.context.mockResolvedValue(approvedContext);
 api.analyze.mockRejectedValueOnce(new DailyReviewProgress(2,4));
 const first=await (await post({action:'advance',jobId:job.id})).json();
 expect(first.job.status).toBe('running');expect(first.job.currentReview).toEqual({done:2,total:4});
 expect(blobs.get(savedPath)!.value.html).toBe('previous');
 expect(api.windows).toHaveBeenCalledTimes(1);
 api.context.mockRejectedValue(Error('Context store is now unavailable'));
 const result=await (await post({action:'advance',jobId:job.id})).json();
 expect(result.saved.html).toContain('Skill finding');
 expect(api.windows).toHaveBeenCalledTimes(1);
 expect(api.context).toHaveBeenCalledTimes(1);
 expect(api.analyze.mock.calls[1][0].reviewContext).toEqual(approvedContext);
 expect(result.job.currentReview).toBeUndefined();
});

it('refreshes the assigned portfolio instead of reusing an older account selection',async()=>{
 const first={...account,id:'act_2036318527081035',name:'Victoria Harbor Cafe'},second={...account,id:'act_791947983578213',name:'Mandarin Chinese Halal'},unassigned={...account,id:'act_587490045801812',name:'td Big Apple'};
 api.accounts.mockResolvedValue([unassigned,second,first]);
 const response=await post({action:'start',version:'v1',date:'2025-01-10'}),body=await response.json();
 expect(response.status).toBe(200);expect(body.job.total).toBe(2);
 expect(blobs.get(pending)!.value.accountIds).toEqual([first.id,second.id]);
 expect(blobs.get(pending)!.value.template.clients).toHaveLength(15);
 expect(blobs.get(pending)!.value.template.clients.map((c:any)=>c.name)).not.toContain('Big Apple');
 expect(blobs.get(savedPath)!.value.html).toBe('previous');
});
