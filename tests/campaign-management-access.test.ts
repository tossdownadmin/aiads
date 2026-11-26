import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({session:vi.fn(),accounts:vi.fn(),access:vi.fn(),inventory:vi.fn(),assets:vi.fn(),prepare:vi.fn(),execute:vi.fn(),read:vi.fn(),history:vi.fn(),publicDraft:vi.fn()}));
vi.mock('../lib/competitors/auth',()=>({paidSourceSession:mocks.session}));
vi.mock('../lib/meta/read',()=>({getAdAccounts:mocks.accounts}));
vi.mock('../lib/meta/management/graph',()=>({accountAccess:mocks.access,inventory:mocks.inventory,assets:mocks.assets}));
vi.mock('../lib/meta/management/service',()=>({prepare:mocks.prepare,execute:mocks.execute,publicDraft:mocks.publicDraft}));
vi.mock('../lib/meta/management/store',()=>({readDraft:mocks.read,history:mocks.history,ChangeConflict:class extends Error{}}));
import {GET,POST} from '../app/api/meta/manage/route';
const request=(body:unknown,origin='https://example.com',type='application/json')=>new Request('https://example.com/api/meta/manage',{method:'POST',headers:{origin,'Content-Type':type},body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();mocks.session.mockResolvedValue({user:{email:'operator@example.com'}});mocks.access.mockResolvedValue({canWrite:false,reasons:['Not enabled']});mocks.inventory.mockResolvedValue([]);mocks.publicDraft.mockImplementation(d=>d);mocks.prepare.mockResolvedValue({id:'review'});});
it('requires sign-in for every management read and write',async()=>{
  mocks.session.mockResolvedValue(null);expect((await GET(new Request('https://example.com?view=accounts'))).status).toBe(401);expect((await POST(request({}))).status).toBe(401);expect(mocks.access).not.toHaveBeenCalled();expect(mocks.prepare).not.toHaveBeenCalled();
});
it('blocks cross-origin and non-JSON mutations before reading or writing draft state',async()=>{
  expect((await POST(request({},'https://attacker.example'))).status).toBe(403);expect((await POST(request({},'https://example.com','text/plain'))).status).toBe(403);expect((await POST(new Request('https://example.com',{method:'POST',body:'{}'}))).status).toBe(403);expect(mocks.prepare).not.toHaveBeenCalled();expect(mocks.execute).not.toHaveBeenCalled();
});
it('requires literal approval and a complete immutable review reference',async()=>{
  expect((await POST(request({action:'execute',accountId:'act_123',id:'1234567890123-11111111-1111-1111-1111-111111111111',digest:'a'.repeat(64),approved:false}))).status).toBe(400);expect(mocks.execute).not.toHaveBeenCalled();
});
it('allows read-only account browsing while the write gate is disabled',async()=>{
  const response=await GET(new Request('https://example.com?accountId=act_123&view=campaigns'));expect(response.status).toBe(200);expect((await response.json()).access.canWrite).toBe(false);expect(mocks.inventory).toHaveBeenCalledWith('act_123','campaign',undefined);
});
it('rejects malformed account and parent IDs before Graph lookups',async()=>{
  expect((await GET(new Request('https://example.com?accountId=../me&view=ads'))).status).toBe(400);expect(mocks.access).not.toHaveBeenCalled();expect((await GET(new Request('https://example.com?accountId=act_123&view=ads&parentId=../../me'))).status).toBe(400);expect(mocks.inventory).not.toHaveBeenCalled();
});
it('does not expose Graph error messages or credentials in an API error',async()=>{
  mocks.inventory.mockRejectedValue(Error('access_token=secret-token https://graph.facebook.com'));const response=await GET(new Request('https://example.com?accountId=act_123&view=campaigns'));expect(response.status).toBe(503);expect(JSON.stringify(await response.json())).not.toMatch(/secret-token|graph.facebook/);
});

it('accepts only a scoped monitoring reference and forwards it to the reviewed draft service',async()=>{
 const reference={period:'7d',runId:'8200000000000-11111111-1111-1111-1111-111111111111',findingId:'efficiency-trend:101:7d'},operation={action:'update',kind:'campaign',id:'101',fields:{name:'Reviewed'}};
 const response=await POST(request({action:'preview',accountId:'act_123',operation,currencyContract:'meta-offset-v1',monitoringReference:reference}));expect(response.status).toBe(200);expect(mocks.prepare).toHaveBeenCalledWith('act_123','operator@example.com',operation,'meta-offset-v1',reference);expect(mocks.execute).not.toHaveBeenCalled();
 expect((await POST(request({action:'preview',accountId:'act_123',operation,monitoringReference:{...reference,accountId:'act_999'}}))).status).toBe(400);
});
