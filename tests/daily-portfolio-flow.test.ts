import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {activeClients} from '../config/active-clients';
import {dailyWindows,shiftDay} from '../lib/reports/model';
import {ReportModelError} from '../lib/skills/report-errors';
const api=vi.hoisted(()=>({model:vi.fn(),get:vi.fn(),head:vi.fn(),put:vi.fn(),list:vi.fn()}));
vi.mock('../lib/auth',()=>({verifyAdminSession:async()=>true}));
vi.mock('../lib/ai/bedrock',()=>({invokeReportModel:api.model}));
vi.mock('@vercel/blob',()=>({get:api.get,head:api.head,put:api.put,list:api.list,BlobNotFoundError:class extends Error{},BlobPreconditionFailedError:class extends Error{}}));
import {BlobNotFoundError,BlobPreconditionFailedError} from '@vercel/blob';
import {GET,POST} from '../app/api/meta/reports/daily/route';
const savedPath='reports/daily/latest-v1.json';
const blobs=new Map<string,{value:any;version:string}>();let version=0;
const call=(body:unknown)=>POST(new Request('https://app.test/api/meta/reports/daily',{method:'POST',body:JSON.stringify(body)}));

beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv('META_SYSTEM_USER_TOKEN','synthetic-test-token');vi.stubEnv('BEDROCK_MODEL_ID','synthetic-model');
 blobs.clear();version=1;blobs.set(savedPath,{value:{html:'previous saved report',date:'2026-11-18',savedAt:'2026-11-19T00:00:00Z',accountIds:[]},version:'v1'});
 api.list.mockResolvedValue({blobs:[],hasMore:false});
 api.head.mockImplementation(async(path:string)=>{const row=blobs.get(path);if(!row)throw new BlobNotFoundError();return {etag:row.version};});
 api.get.mockImplementation(async(path:string)=>{const row=blobs.get(path);return row?{stream:new Response(JSON.stringify(row.value)).body,blob:{etag:row.version}}:null;});
 api.put.mockImplementation(async(path:string,encoded:string,options:any)=>{const old=blobs.get(path);if(options.ifMatch&&old?.version!==options.ifMatch||!options.allowOverwrite&&old)throw new BlobPreconditionFailedError();const next='v'+(++version);blobs.set(path,{value:JSON.parse(encoded),version:next});return {etag:next};});
 vi.stubGlobal('fetch',async(input:URL)=>{
  const url=new URL(input),q=url.searchParams,path=url.pathname;
  if(path.endsWith('/me/adaccounts'))return Response.json({data:activeClients.map(c=>({id:c.accountId,name:c.name,account_status:1,currency:'CAD',timezone_name:'America/Toronto'}))});
  const account=path.match(/\/(act_\d+)\//)?.[1]??activeClients[0].accountId;
  const campaignId=account.slice(4)+'01',adsetId=account.slice(4)+'02',adId=account.slice(4)+'03';
  if(path.endsWith('/campaigns'))return Response.json({data:[{id:campaignId,name:'Lead campaign',effective_status:'ACTIVE',status:'ACTIVE',objective:'OUTCOME_LEADS'}]});
  if(path.endsWith('/adsets'))return Response.json({data:[{id:adsetId,campaign_id:campaignId,name:'Local audience',effective_status:'ACTIVE',optimization_goal:'LEAD_GENERATION',bid_strategy:'LOWEST_COST_WITHOUT_CAP',targeting:{geo_locations:{countries:['CA']}}}]});
  if(path.endsWith('/ads'))return Response.json({data:[{id:adId,campaign_id:campaignId,adset_id:adsetId,name:'Lead creative',effective_status:'ACTIVE',creative:{id:'creative-'+adId,body:'Synthetic creative copy'}}]});
  if(path.endsWith('/insights')){
   const range=JSON.parse(q.get('time_range')!),level=q.get('level');
   const row={spend:'100',impressions:'10000',reach:'5000',clicks:'100',ctr:'1',cpc:'1',frequency:'2',actions:[{action_type:'lead',value:'5'}]};
   const identity=level==='account'?{}:level==='campaign'?{campaign_id:campaignId,campaign_name:'Lead campaign',objective:'OUTCOME_LEADS'}:level==='adset'?{campaign_id:campaignId,adset_id:adsetId,adset_name:'Local audience'}:{campaign_id:campaignId,adset_id:adsetId,ad_id:adId,ad_name:'Lead creative'};
   if(q.get('time_increment')==='1'){
    const count=Math.round((Date.parse(range.until)-Date.parse(range.since))/86400000)+1;
    return Response.json({data:Array.from({length:count},(_,i)=>({...row,...identity,date_start:shiftDay(range.since,i)}))});
   }
   return Response.json({data:[{...row,...identity}]});
  }
  throw Error('Unexpected synthetic Meta read: '+path);
 });
 api.model.mockImplementation(async(_instructions,encoded)=>{
  const evidence=JSON.parse(encoded);
  return {periods:evidence.periods.map((p:any)=>({periodId:p.id,findings:[{tone:'ok',category:'win',priority:'monitor',title:'Leads reported',interpretation:'The campaign reported 5 leads during this '+Math.round((Date.parse(p.window.until)-Date.parse(p.window.since))/86400000+1)+'-day review.',evidenceIds:[p.id+':account:leads'],action:'Confirm lead quality',reason:'Reported leads still need business qualification.'}]}))};
 });
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});

it('runs the real 15-account route → Meta adapters → skill → validation → private storage → downloadable report flow',async()=>{
 // External service boundaries only are mocked; the actual reader, hierarchy,
 // skill loader, retry runner, validator, job state and renderer are exercised.
 const started=await (await call({action:'start',version:'v1',date:'2026-11-19'})).json();
 expect(started.job.total).toBe(15);
 let saved;
 for(let count=0;count<15;count++){
  const result=await (await call({action:'advance',jobId:started.job.id})).json();
  expect(result.job.status).not.toBe('failed');expect(result.job.done).toBe(count+1);
  if(count<14){expect(result.saved).toBeUndefined();expect(blobs.get(savedPath)!.value.html).toBe('previous saved report');}
  else saved=result.saved;
 }
 expect(saved.accountIds).toEqual(activeClients.map(c=>c.accountId));expect(saved.runs).toHaveLength(15);
 for(const name of ['Victoria Harbor Cafe','Mandarin Chinese','Cola One','tossdown'])expect(saved.html).toContain(name);
 for(const label of ['Wins','Concerns','Prioritized actions','Campaign Performance','rel="icon"','data-window="0"','data-window="1"'])expect(saved.html).toContain(label);
 expect(saved.html).toContain('5 leads during this 7-day review');expect(saved.html).toContain('5 leads during this 30-day review');
 const reopened=await (await GET()).json();expect(reopened.saved.html).toBe(saved.html);expect(api.model).toHaveBeenCalledTimes(15);
 await call({action:'advance',jobId:started.job.id});expect(api.model).toHaveBeenCalledTimes(15);
});

it('automatically repairs a malformed first AI response and finishes the account without manual Resume',async()=>{
 api.model.mockRejectedValueOnce(new ReportModelError('model_response','Incomplete JSON'));
 const started=await (await call({action:'start',version:'v1',accountIds:[activeClients[0].accountId],date:'2026-11-19'})).json();
 const result=await (await call({action:'advance',jobId:started.job.id})).json();
 expect(result.job.status).toBe('complete');expect(result.saved.accountIds).toHaveLength(1);expect(api.model).toHaveBeenCalledTimes(2);
});
