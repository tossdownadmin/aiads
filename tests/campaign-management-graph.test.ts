import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({get:vi.fn(),pages:vi.fn()}));
vi.mock('../lib/meta/read',()=>({fetchGraph:mocks.get,fetchAllPages:mocks.pages}));
import {accountAccess,entity,postGraph} from '../lib/meta/management/graph';
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('META_WRITE_ENABLED','true');vi.stubEnv('META_WRITE_ACCOUNT_IDS','act_123');vi.stubEnv('META_SYSTEM_USER_TOKEN','server-secret-token');vi.stubEnv('BLOB_READ_WRITE_TOKEN','fake-storage-token');mocks.get.mockResolvedValue({id:'act_123',name:'Account',currency:'CAD',account_status:1,user_tasks:['ADVERTISE']});mocks.pages.mockResolvedValue([{permission:'ads_management',status:'granted'}]);});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('requires all server, scope, role, active-account and storage gates',async()=>{
  expect((await accountAccess('act_123')).canWrite).toBe(true);
  vi.stubEnv('META_WRITE_ENABLED','false');expect((await accountAccess('act_123')).canWrite).toBe(false);vi.stubEnv('META_WRITE_ENABLED','true');
  vi.stubEnv('META_WRITE_ACCOUNT_IDS','*');expect((await accountAccess('act_123')).canWrite).toBe(false);vi.stubEnv('META_WRITE_ACCOUNT_IDS','act_123');
  mocks.pages.mockResolvedValueOnce([{permission:'ads_read',status:'granted'}]);expect((await accountAccess('act_123')).canWrite).toBe(false);
  mocks.get.mockResolvedValueOnce({account_status:1,user_tasks:['ANALYZE']});expect((await accountAccess('act_123')).canWrite).toBe(false);
  mocks.get.mockResolvedValueOnce({account_status:2,user_tasks:['MANAGE']});expect((await accountAccess('act_123')).canWrite).toBe(false);
  vi.stubEnv('BLOB_READ_WRITE_TOKEN','');expect((await accountAccess('act_123')).canWrite).toBe(false);
});
it('checks object ownership even when an operator supplies a known foreign ID',async()=>{
  mocks.get.mockResolvedValueOnce({id:'900',account_id:'456'});await expect(entity('ad','900','act_123')).rejects.toThrow('does not belong');
});
it('never automatically retries a write after an ambiguous fetch failure',async()=>{
  const fetch=vi.fn().mockRejectedValue(Error('Network error containing server-secret-token'));vi.stubGlobal('fetch',fetch);
  await expect(postGraph('100',{status:'PAUSED'})).rejects.toMatchObject({uncertain:true});expect(fetch).toHaveBeenCalledTimes(1);expect(fetch.mock.calls[0][0]).not.toContain('server-secret-token');expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer server-secret-token');
});
it('rejects arbitrary write paths and sanitizes a Meta rejection',async()=>{
  const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{message:'secret-token',code:200}}),{status:403}));vi.stubGlobal('fetch',fetch);
  await expect(postGraph('me/permissions',{})).rejects.toThrow('Unsupported');expect(fetch).not.toHaveBeenCalled();await expect(postGraph('100',{status:'PAUSED'})).rejects.toThrow('Meta rejected');expect(fetch).toHaveBeenCalledTimes(1);
});
it('treats server failures and malformed acknowledgements as unknown outcomes',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({error:{code:2}}),{status:503})).mockResolvedValueOnce(new Response('null',{status:200}));vi.stubGlobal('fetch',fetch);
  await expect(postGraph('100',{status:'PAUSED'})).rejects.toMatchObject({uncertain:true});await expect(postGraph('100',{status:'PAUSED'})).rejects.toMatchObject({uncertain:true});expect(fetch).toHaveBeenCalledTimes(2);
});
