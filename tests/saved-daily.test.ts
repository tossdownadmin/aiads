import {beforeEach,expect,it,vi} from 'vitest';
import {comparisonWindow,metrics} from '../lib/reports/model';
import {getReportingSkills,skillVersion} from '../lib/skills/report-packages';
const api=vi.hoisted(()=>({auth:vi.fn(),get:vi.fn(),head:vi.fn(),put:vi.fn(),accounts:vi.fn(),windows:vi.fn(),skill:vi.fn(),analyze:vi.fn()}));
vi.mock('../lib/auth',()=>({verifyAdminSession:api.auth}));
vi.mock('../lib/meta/read',()=>({getAdAccounts:api.accounts}));
vi.mock('../lib/reports/read',()=>({readReportWindows:api.windows}));
vi.mock('../lib/skills/report-runner',()=>({selectReportSkill:api.skill}));
vi.mock('../lib/reports/daily-analysis',()=>({analyzeDailyReport:api.analyze}));
vi.mock('@vercel/blob',()=>({get:api.get,head:api.head,put:api.put,BlobNotFoundError:class extends Error{},BlobPreconditionFailedError:class extends Error{}}));
import {GET,POST} from '../app/api/meta/reports/daily/route';
import {BlobNotFoundError,BlobPreconditionFailedError} from '@vercel/blob';
const account={id:'act_123',name:'Test client',currency:'CAD',status:1,timezone:'America/Toronto'};
const old={date:'2025-01-10',accountIds:[account.id],html:'previous',savedAt:'2025-01-11T00:00:00Z'};
const savedPath='reports/daily/latest-v1.json',pending='reports/daily/pending-v1.json';
const blobs=new Map<string,{value:any;version:string}>();let number=0;
const post=(body:unknown)=>POST(new Request('https://example.com/api/meta/reports/daily',{method:'POST',body:JSON.stringify(body)}));
async function start(extra={}){return (await (await post({action:'start',version:'v1',...extra})).json()).job;}
beforeEach(()=>{
 vi.resetAllMocks();blobs.clear();number=1;blobs.set(savedPath,{value:structuredClone(old),version:'v1'});
 api.auth.mockResolvedValue(true);api.accounts.mockResolvedValue([account]);api.skill.mockResolvedValue(getReportingSkills()[0]);
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
