import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({access:vi.fn(),entity:vi.fn(),post:vi.fn(),read:vi.fn(),save:vi.fn(),fetch:vi.fn(),pages:vi.fn(),claim:vi.fn(),source:vi.fn()}));
vi.mock('../lib/meta/management/graph',()=>({accountAccess:mocks.access,entity:mocks.entity,postGraph:mocks.post}));
vi.mock('../lib/meta/management/store',()=>({readDraft:mocks.read,saveDraft:mocks.save,claimAccount:mocks.claim,ChangeConflict:class ChangeConflict extends Error{}}));
vi.mock('../lib/meta/management/evidence',()=>({resolveChangeEvidence:mocks.source}));
vi.mock('../lib/meta/read',()=>({fetchGraph:mocks.fetch,fetchAllPages:mocks.pages}));
import { execute, prepare, publicDraft } from '../lib/meta/management/service';
import { majorToMinor, operationSchema, type Draft, type Entity } from '../lib/meta/management/types';
it('requires a fresh client currency contract for financial reviews and old pending budgets',async()=>{
 await expect(prepare('act_123','operator@example.com',{action:'update',kind:'adset',id:'200',fields:{daily_budget:'2000'}},'legacy')).rejects.toThrow('Reload');expect(mocks.post).not.toHaveBeenCalled();
 const draft=await prepare('act_123','operator@example.com',{action:'update',kind:'adset',id:'200',fields:{daily_budget:'2000'}});
 const stored=records.get(draft.id)!;delete stored.draft.currencyContract;
 await expect(execute('act_123',draft.id,'operator@example.com',draft.digest)).rejects.toThrow('fresh budget review');expect(mocks.post).not.toHaveBeenCalled();
});
const accountId='act_123',owner='operator@example.com';
let records:Map<string,{draft:Draft;version:string}>,entities:Map<string,Entity>,counter:number;
beforeEach(()=>{
  vi.resetAllMocks();mocks.claim.mockResolvedValue(vi.fn().mockResolvedValue(undefined));counter=0;records=new Map();entities=new Map([
    ['100',{id:'100',account_id:'123',name:'Campaign',status:'ACTIVE',effective_status:'ACTIVE',objective:'OUTCOME_TRAFFIC',special_ad_categories:[]}],
    ['200',{id:'200',account_id:'123',campaign_id:'100',name:'Ad set',status:'ACTIVE',effective_status:'ACTIVE',daily_budget:'1000',optimization_goal:'LINK_CLICKS',billing_event:'IMPRESSIONS',targeting:{geo_locations:{countries:['CA']},age_min:18,age_max:65,publisher_platforms:['facebook','instagram']}}],
    ['300',{id:'300',account_id:'123',campaign_id:'100',adset_id:'200',name:'Ad',status:'ACTIVE',effective_status:'ACTIVE',creative:{id:'400'}}],
    ['400',{id:'400',account_id:'123',name:'Creative',object_story_id:'500_600'}],
  ]);
  mocks.access.mockResolvedValue({account:{id:accountId,name:'Test account',currency:'CAD'},canWrite:true,reasons:[]});
  mocks.entity.mockImplementation(async(kind,id)=>{const e=entities.get(id);if(!e)throw Error('Unknown entity');return structuredClone(e);});
  mocks.read.mockImplementation(async(account,id)=>structuredClone(records.get(id)||null));
  mocks.save.mockImplementation(async(draft:Draft,version?:string)=>{
    const old=records.get(draft.id);if((version&&old?.version!==version)||(!version&&old))throw Error('Storage conflict');
    const next=String(++counter);records.set(draft.id,{draft:structuredClone(draft),version:next});return next;
  });
  mocks.pages.mockResolvedValue([{id:'500',name:'Page'}]);
  mocks.post.mockImplementation(async(path:string,fields:Record<string,unknown>)=>{
    if(path.includes('/')){const id='900';entities.set(id,{id,account_id:'123',...structuredClone(fields)} as Entity);return {id};}
    const before=entities.get(path)!;entities.set(path,{...before,...structuredClone(fields),...(fields.creative?{creative:{id:(fields.creative as {creative_id:string}).creative_id}}:{})});return {success:true};
  });
});
const reviewStatus=()=>prepare(accountId,owner,{action:'status',targets:[{kind:'campaign',id:'100',status:'PAUSED'}]});
it('previews exact changes without a Graph write and applies only its saved payload',async()=>{
  const draft=await reviewStatus();expect(mocks.post).not.toHaveBeenCalled();expect(draft.changes[0]).toMatchObject({before:'ACTIVE',after:'PAUSED'});
  const result=await execute(accountId,draft.id,owner,draft.digest);expect(result.state).toBe('complete');expect(mocks.post).toHaveBeenCalledTimes(1);expect(mocks.post).toHaveBeenCalledWith('100',{status:'PAUSED'});expect(result.steps[0].result).toMatchObject({id:'100',status:'PAUSED'});
});
it('creates campaigns paused and refuses an active status or unsupported field on creation',async()=>{
  expect(()=>operationSchema.parse({action:'create_campaign',fields:{name:'New',objective:'OUTCOME_TRAFFIC',status:'ACTIVE'}})).toThrow();
  const draft=await prepare(accountId,owner,{action:'create_campaign',fields:{name:'New',objective:'OUTCOME_TRAFFIC'}});
  expect(draft.steps[0].fields.status).toBe('PAUSED');const result=await execute(accountId,draft.id,owner,draft.digest);expect(result.state).toBe('complete');expect(mocks.post.mock.calls[0][1]).toMatchObject({status:'PAUSED',special_ad_categories:[]});
});
it('creates paused ads with owned parent and creative dependencies',async()=>{
  const draft=await prepare(accountId,owner,{action:'create_ad',fields:{name:'New ad',adset_id:'200',creative_id:'400'}});
  expect(draft.dependencies.map(d=>d.id)).toEqual(expect.arrayContaining(['100','200','400']));expect(draft.steps[0].fields).toMatchObject({status:'PAUSED',creative:{creative_id:'400'}});
});
it('retains omitted targeting fields and records both the complete current and proposed audience',async()=>{
  const draft=await prepare(accountId,owner,{action:'update',kind:'adset',id:'200',fields:{targeting:{age_min:25}}});
  expect(draft.steps[0].fields.targeting).toEqual({geo_locations:{countries:['CA']},age_min:25,age_max:65,publisher_platforms:['facebook','instagram']});expect(draft.changes[0].before).toMatchObject({age_min:18});
});
it('rejects unsupported updates, invalid budgets, empty changes and duplicate status targets',async()=>{
  await expect(prepare(accountId,owner,{action:'update',kind:'campaign',id:'100',fields:{objective:'OUTCOME_SALES'}})).rejects.toThrow();
  await expect(prepare(accountId,owner,{action:'update',kind:'campaign',id:'100',fields:{name:'Campaign'}})).rejects.toThrow('Choose a field');
  await expect(prepare(accountId,owner,{action:'update',kind:'adset',id:'200',fields:{daily_budget:'100',lifetime_budget:'200'}})).rejects.toThrow('either');
  await expect(prepare(accountId,owner,{action:'status',targets:[{kind:'ad',id:'300',status:'PAUSED'},{kind:'ad',id:'300',status:'ACTIVE'}]})).rejects.toThrow('more than once');expect(mocks.post).not.toHaveBeenCalled();
});
it('rejects expired, wrong-operator, wrong-digest and externally changed reviews before writing',async()=>{
  const draft=await reviewStatus();await expect(execute(accountId,draft.id,'other@example.com',draft.digest)).rejects.toThrow('operator');
  await expect(execute(accountId,draft.id,owner,'0'.repeat(64))).rejects.toThrow();
  entities.set('100',{...entities.get('100')!,name:'Changed in Meta'});await expect(execute(accountId,draft.id,owner,draft.digest)).rejects.toThrow('changed since');
  const stored=records.get(draft.id)!;stored.draft.expiresAt=new Date(0).toISOString();await expect(execute(accountId,draft.id,owner,draft.digest)).rejects.toThrow('expired');expect(mocks.post).not.toHaveBeenCalled();
});
it('rechecks write access at execution even if preview access was enabled',async()=>{
  const draft=await reviewStatus();mocks.access.mockResolvedValueOnce({canWrite:false,reasons:['Account editing is disabled.']});await expect(execute(accountId,draft.id,owner,draft.digest)).rejects.toThrow('disabled');expect(mocks.post).not.toHaveBeenCalled();
});
it('claims a review once so concurrent or repeated apply requests cannot repeat writes',async()=>{
  const draft=await reviewStatus();const outcomes=await Promise.allSettled([execute(accountId,draft.id,owner,draft.digest),execute(accountId,draft.id,owner,draft.digest)]);
  expect(outcomes.filter(o=>o.status==='fulfilled')).toHaveLength(1);expect(mocks.post).toHaveBeenCalledTimes(1);await expect(execute(accountId,draft.id,owner,draft.digest)).rejects.toThrow();expect(mocks.post).toHaveBeenCalledTimes(1);
});
it('stops after partial failure, retains earlier IDs and never retries rejected writes',async()=>{
  const draft=await prepare(accountId,owner,{action:'status',targets:[{kind:'campaign',id:'100',status:'PAUSED'},{kind:'adset',id:'200',status:'PAUSED'},{kind:'ad',id:'300',status:'PAUSED'}]});
  mocks.post.mockImplementationOnce(async()=>{entities.set('100',{...entities.get('100')!,status:'PAUSED'});return {success:true};}).mockRejectedValueOnce(Error('Rejected'));
  const result=await execute(accountId,draft.id,owner,draft.digest);expect(result.state).toBe('partial');expect(result.steps.map(s=>s.state)).toEqual(['verified','failed',undefined]);expect(result.steps[0].result?.id).toBe('100');expect(mocks.post).toHaveBeenCalledTimes(2);
});
it('marks an ambiguous network outcome uncertain and prevents a blind retry',async()=>{
  const draft=await reviewStatus();mocks.post.mockRejectedValueOnce(Object.assign(Error('Timeout'),{uncertain:true}));const result=await execute(accountId,draft.id,owner,draft.digest);expect(result.state).toBe('uncertain');expect(result.steps[0].state).toBe('unknown');await expect(execute(accountId,draft.id,owner,draft.digest)).rejects.toThrow();expect(mocks.post).toHaveBeenCalledTimes(1);
});
it('does not report success when Meta readback differs, and keeps the created object ID',async()=>{
  const draft=await prepare(accountId,owner,{action:'create_campaign',fields:{name:'New',objective:'OUTCOME_TRAFFIC'}});mocks.post.mockResolvedValueOnce({id:'900'});entities.set('900',{id:'900',account_id:'123',name:'Unexpected',status:'ACTIVE'});const result=await execute(accountId,draft.id,owner,draft.digest);expect(result.state).toBe('uncertain');expect(result.steps[0].result?.id).toBe('900');
});
it('creates a separate replacement creative, then attaches it only after verified creation',async()=>{
  const draft=await prepare(accountId,owner,{action:'replace_creative',id:'300',creative:{name:'Replacement',object_story_id:'500_700'}});expect(draft.steps).toHaveLength(1);expect(draft.steps[0].replaceAd).toBe('300');
  const result=await execute(accountId,draft.id,owner,draft.digest);expect(result.state).toBe('complete');expect(mocks.post.mock.calls.map(c=>c[0])).toEqual(['act_123/adcreatives','300']);expect(mocks.post.mock.calls[1][1]).toEqual({creative:{creative_id:'900'}});expect(entities.get('400')!.object_story_id).toBe('500_600');
});
it('does not attach a new creative when its creation outcome is unknown',async()=>{
  const draft=await prepare(accountId,owner,{action:'replace_creative',id:'300',creative:{name:'Replacement',object_story_id:'500_700'}});mocks.post.mockRejectedValueOnce(Object.assign(Error('Timeout'),{uncertain:true}));const result=await execute(accountId,draft.id,owner,draft.digest);expect(result.state).toBe('uncertain');expect(mocks.post).toHaveBeenCalledTimes(1);expect(entities.get('300')!.creative).toEqual({id:'400'});
});
it('keeps upload bytes out of browser reviews and validates image format and size',async()=>{
  const bytes=Buffer.from([137,80,78,71,13,10,26,10]).toString('base64');const draft=await prepare(accountId,owner,{action:'upload_image',fileName:'image.png',mime:'image/png',bytes});expect(JSON.stringify(publicDraft(draft))).not.toContain(bytes);
  await expect(prepare(accountId,owner,{action:'upload_image',fileName:'image.png',mime:'image/png',bytes:Buffer.from('not an image').toString('base64')})).rejects.toThrow('valid JPEG');
});
it('converts budget input exactly for two- and zero-decimal currencies',()=>{
  expect(majorToMinor('12.34','CAD')).toBe('1234');expect(majorToMinor('100','JPY')).toBe('100');expect(majorToMinor('0.01','USD')).toBe('1');expect(()=>majorToMinor('1.234','CAD')).toThrow();expect(()=>majorToMinor('1.50','JPY')).toThrow();expect(()=>majorToMinor('0','CAD')).toThrow();
});
it('exposes exact currency-bearing budget changes individually in a creation review',async()=>{
  const draft=await prepare(accountId,owner,{action:'create_campaign',fields:{name:'Budgeted campaign',objective:'OUTCOME_TRAFFIC',daily_budget:'1234'}});expect(draft.currency).toBe('CAD');expect(draft.changes.find(c=>c.label.endsWith(' · daily_budget'))).toMatchObject({before:null,after:'1234'});expect(draft.changes.find(c=>c.label.endsWith(' · status'))?.after).toBe('PAUSED');
});
it('rejects an age change that conflicts with retained settings and ad-set budgets under campaign budgeting',async()=>{
  entities.set('200',{...entities.get('200')!,targeting:{age_min:18,age_max:30}});await expect(prepare(accountId,owner,{action:'update',kind:'adset',id:'200',fields:{targeting:{age_min:40}}})).rejects.toThrow('Minimum age');
  entities.set('100',{...entities.get('100')!,daily_budget:'3000'});await expect(prepare(accountId,owner,{action:'update',kind:'adset',id:'200',fields:{daily_budget:'2000'}})).rejects.toThrow('campaign controls');expect(mocks.post).not.toHaveBeenCalled();
});

it('retains server-resolved finding evidence in the immutable review and public receipt without applying a change',async()=>{
 const reference={period:'7d',runId:'8200000000000-11111111-1111-1111-1111-111111111111',findingId:'efficiency-trend:100:7d'},source={reference,accountId,entityId:'100',kind:'campaign',title:'Measured review signal',explanation:'Source observation',nextStep:'Human review',window:{since:'2026-11-20',until:'2026-11-26'},completedAt:'2026-11-27T15:00:00Z',skill:{name:'monitor',version:'1.1.0',hash:'a'.repeat(64)},facts:[]};mocks.source.mockResolvedValue(source);
 const op={action:'update',kind:'campaign',id:'100',fields:{name:'Reviewed name'}};
 const draft=await prepare(accountId,owner,op,'meta-offset-v1',reference);expect(mocks.source).toHaveBeenCalledWith(accountId,reference,op);expect(draft.sourceEvidence).toEqual(source);expect(publicDraft(draft).sourceEvidence).toEqual(source);expect(mocks.post).not.toHaveBeenCalled();
 mocks.source.mockResolvedValue({...source,title:'Different source record'});const second=await prepare(accountId,owner,op,'meta-offset-v1',reference);expect(second.digest).not.toBe(draft.digest);
});
