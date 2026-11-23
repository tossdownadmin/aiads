import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(()=>({ auth:vi.fn(), accounts:vi.fn(), get:vi.fn(), put:vi.fn() }));
vi.mock('../lib/auth',()=>({verifyAdminSession:api.auth}));
vi.mock('../lib/meta/read',()=>({getAdAccounts:api.accounts}));
vi.mock('@vercel/blob',()=>({
  get:api.get, put:api.put,
  BlobNotFoundError:class extends Error {},
  BlobPreconditionFailedError:class extends Error {},
}));
import { BlobNotFoundError, BlobPreconditionFailedError } from '@vercel/blob';
import { GET, PUT } from '../app/api/meta/reports/context/route';
import {
  ClientContextConflict,
  readClientContext,
  readVersionedClientContext,
  writeClientContext,
  type DailyClientContext,
} from '../lib/reports/client-context';

const account = {id:'act_123',name:'Connected client',currency:'CAD',status:1};
const second = {...account,id:'act_456',name:'Another connected client',currency:'USD'};
const context = {businessGoal:'Approved business goal',qualificationNotes:'The team reports that qualified leads request a quote.'};
const path = (id=account.id)=>'reports/client-context/'+id+'.json';
const blobs = new Map<string,{context:DailyClientContext;version:string}>();
let sequence = 0;
const get = (id=account.id)=>GET(new Request('https://example.com/api/meta/reports/context?accountId='+encodeURIComponent(id)));
const put = (body:unknown)=>PUT(new Request('https://example.com/api/meta/reports/context', {method:'PUT',body:JSON.stringify(body)}));
const save = (value:unknown=context,version:string|null=null,id=account.id)=>put({accountId:id,context:value,version});

beforeEach(()=>{
  vi.resetAllMocks();blobs.clear();sequence=0;
  api.auth.mockResolvedValue(true);api.accounts.mockResolvedValue([account,second]);
  api.get.mockImplementation(async (key:string)=>{
    const blob = blobs.get(key);
    return blob ? {stream:new Response(JSON.stringify(blob.context)).body,blob:{etag:blob.version}} : null;
  });
  api.put.mockImplementation(async (key:string,body:string,options:{ifMatch?:string;allowOverwrite:boolean})=>{
    const existing = blobs.get(key);
    if ((options.ifMatch && options.ifMatch !== existing?.version) || (!options.allowOverwrite && existing)) throw new BlobPreconditionFailedError();
    const version = 'etag-'+(++sequence);
    blobs.set(key,{context:JSON.parse(body),version});
    return {etag:version,url:'https://private-blob.example.test/private'};
  });
});

describe('authenticated context API',()=>{
  it('authenticates reads and writes before accessing Meta or Blob',async()=>{
    api.auth.mockResolvedValue(false);
    expect((await get()).status).toBe(401);
    expect((await save()).status).toBe(401);
    expect(api.accounts).not.toHaveBeenCalled();expect(api.get).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
  });

  it('validates account paths and checks every connected-account read and write',async()=>{
    for (const id of ['../private','123','act_no','act_123/other']) {
      expect((await get(id)).status).toBe(400);
      expect((await save(context,null,id)).status).toBe(400);
    }
    expect(api.accounts).not.toHaveBeenCalled();
    expect((await get('act_999')).status).toBe(403);
    expect((await save(context,null,'act_999')).status).toBe(403);
    expect(api.get).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
  });

  it('returns a private missing-context response without inventing goals or targets',async()=>{
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({account:{id:account.id,name:account.name,currency:'CAD'},context:null,version:null});
    expect(api.put).not.toHaveBeenCalled();
  });

  it('persists shared per-account context privately with server currency and timestamp',async()=>{
    const response = await save({...context,targetCpa:24,targetCpl:12,targetRoas:3.5,monthlyBudget:1000,budgetMonth:'2026-11'});
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(body.context).toEqual({...context,accountId:account.id,currency:'CAD',updatedAt:expect.any(String),targetCpa:24,targetCpl:12,targetRoas:3.5,monthlyBudget:1000,budgetMonth:'2026-11'});
    expect(Number.isFinite(Date.parse(body.context.updatedAt))).toBe(true);
    expect(api.put).toHaveBeenCalledWith(path(),expect.any(String),{
      access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json',
    });
    expect((await (await get()).json()).context).toEqual(body.context);
    expect((await (await get(second.id)).json()).context).toBeNull();
    await save({...context,businessGoal:'Second account goal'},null,second.id);
    expect((await readClientContext(second.id))?.currency).toBe('USD');
    expect((await readClientContext(account.id))?.businessGoal).toBe(context.businessGoal);
    expect(JSON.stringify(body)).not.toContain('private-blob');
  });

  it.each([
    ['targetCpa',0],['targetCpa',-1],['targetCpl',0],['targetCpl',null],['targetRoas',-2],
    ['targetRoas','3'],['monthlyBudget',0],['monthlyBudget',-1],['businessGoal','a'.repeat(1201)],
    ['qualificationNotes','a'.repeat(1201)],['businessGoal',null],['budgetMonth','2026-13'],
    ['budgetMonth','2026-00'],['budgetMonth','2026-1'],['budgetMonth','2026-11-01'],
  ])('rejects invalid %s values',async(field,value)=>{
    expect((await save({...context,[field]:value})).status).toBe(400);
    expect(api.put).not.toHaveBeenCalled();
  });

  it('requires a month for monthly budgets and accepts empty optional inputs',async()=>{
    expect((await save({...context,monthlyBudget:1000})).status).toBe(400);
    expect((await save({businessGoal:'',qualificationNotes:''})).status).toBe(200);
    const stored = await readClientContext(account.id);
    expect(stored).toMatchObject({businessGoal:'',qualificationNotes:''});
    for (const field of ['targetCpa','targetCpl','targetRoas','monthlyBudget','budgetMonth']) expect(stored).not.toHaveProperty(field);
  });

  it('rejects approval validity that ends before approval',async()=>{
    expect((await save({...context,approvedOn:'2026-11-20',validUntil:'2026-11-01'})).status).toBe(400);
    expect(api.put).not.toHaveBeenCalled();
  });

  it('accepts the text limits, fractional positive targets and month-only context',async()=>{
    expect((await save({businessGoal:'a'.repeat(1200),qualificationNotes:'b'.repeat(1200),targetCpa:0.001,targetCpl:0.5,targetRoas:1.5,budgetMonth:'2026-02'})).status).toBe(200);
  });

  it('rejects client-editable metadata, unknown fields, missing versions and malformed JSON',async()=>{
    for (const extra of [{currency:'USD'},{updatedAt:'2020-01-01T00:00:00Z'},{accountId:second.id},{crmVerified:true}]) {
      expect((await save({...context,...extra})).status).toBe(400);
    }
    expect((await put({accountId:account.id,context})).status).toBe(400);
    expect((await save(context,'')).status).toBe(400);
    expect((await PUT(new Request('https://example.com/api/meta/reports/context',{method:'PUT',body:'{'}))).status).toBe(400);
    expect(api.put).not.toHaveBeenCalled();
  });

  it('uses an ETag precondition for updates and clears omitted targets on replacement',async()=>{
    const first = await (await save({...context,targetCpa:25,monthlyBudget:500,budgetMonth:'2026-11'})).json();
    const response = await save({...context,businessGoal:'Revised approved goal'},first.version);
    expect(response.status).toBe(200);
    expect(api.put.mock.calls.at(-1)?.[2]).toMatchObject({access:'private',allowOverwrite:true,ifMatch:first.version});
    const saved = await readClientContext(account.id);
    expect(saved?.businessGoal).toBe('Revised approved goal');
    expect(saved).not.toHaveProperty('targetCpa');expect(saved).not.toHaveProperty('monthlyBudget');expect(saved).not.toHaveProperty('budgetMonth');
  });

  it('rejects stale edits and concurrent first saves without losing a teammate’s update',async()=>{
    const [first,secondResponse] = await Promise.all([save(),save({...context,businessGoal:'Other edit'})]);
    expect([first.status,secondResponse.status]).toEqual([200,409]);
    expect((await save({...context,businessGoal:'Stale edit'},'stale-etag')).status).toBe(409);
    const latest = await (await get()).json();
    await save({...context,businessGoal:'Teammate edit'},latest.version);
    expect((await save({...context,businessGoal:'Old loaded draft'},latest.version)).status).toBe(409);
    expect((await readClientContext(account.id))?.businessGoal).toBe('Teammate edit');
  });

  it('reports connected-account currency and sanitizes connection and Blob failures',async()=>{
    await save();
    api.accounts.mockResolvedValue([{...account,currency:'EUR'}]);
    const body = await (await get()).json();
    expect(body.account.currency).toBe('EUR');expect(body.context.currency).toBe('CAD');
    const secret = 'Bearer sensitive-token BLOB_READ_WRITE_TOKEN=private-token';
    api.get.mockRejectedValue(Error(secret));
    const readFailure = await get();expect(readFailure.status).toBe(503);expect(await readFailure.text()).not.toContain(secret);
    api.put.mockRejectedValue(Error(secret));
    const writeFailure = await save();expect(writeFailure.status).toBe(503);expect(await writeFailure.text()).not.toContain(secret);
    api.accounts.mockRejectedValue(Error(secret));
    expect(await (await get()).text()).not.toContain(secret);
  });
});

describe('server reader and storage boundaries',()=>{
  it('returns null for both Blob missing responses and uses the body’s own ETag',async()=>{
    expect(await readClientContext(account.id)).toBeNull();
    api.get.mockRejectedValueOnce(new BlobNotFoundError());
    expect(await readClientContext(account.id)).toBeNull();
    const stored = await writeClientContext(account,context,null);
    expect(await readVersionedClientContext(account.id)).toEqual(stored);
    expect(api.get).toHaveBeenCalledWith(path(),{access:'private',useCache:false});
    expect(api.accounts).not.toHaveBeenCalled();
  });

  it('does not treat storage outages, invalid stored data or missing bodies as absent context',async()=>{
    api.get.mockRejectedValueOnce(Error('unavailable'));
    await expect(readClientContext(account.id)).rejects.toThrow('unavailable');
    await writeClientContext(account,context,null);
    blobs.get(path())!.context.accountId=second.id;
    await expect(readClientContext(account.id)).rejects.toThrow('account mismatch');
    api.get.mockResolvedValueOnce({stream:null,blob:{etag:'etag'}});
    await expect(readClientContext(account.id)).rejects.toThrow('unavailable');
    api.get.mockResolvedValueOnce({stream:new Response(JSON.stringify({accountId:account.id})).body,blob:{etag:'etag'}});
    await expect(readClientContext(account.id)).rejects.toThrow();
  });

  it('validates internal reader paths, finite numbers, and maps create conflicts',async()=>{
    await expect(readClientContext('../other')).rejects.toThrow();
    expect(api.get).not.toHaveBeenCalled();
    for (const value of [Infinity,NaN,-Infinity]) {
      await expect(writeClientContext(account,{...context,targetRoas:value},null)).rejects.toThrow();
    }
    api.put.mockRejectedValueOnce(Error('Blob already exists'));
    await expect(writeClientContext(account,context,null)).rejects.toBeInstanceOf(ClientContextConflict);
  });
});
