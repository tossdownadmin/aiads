import {beforeEach,expect,it,vi} from 'vitest';
import {comparisonWindow} from '../lib/reports/model';

const api=vi.hoisted(()=>({auth:vi.fn(),get:vi.fn(),put:vi.fn(),accounts:vi.fn(),windows:vi.fn()}));
vi.mock('../lib/auth',()=>({verifyAdminSession:api.auth}));
vi.mock('../lib/meta/read',()=>({getAdAccounts:api.accounts}));
vi.mock('../lib/reports/read',()=>({readReportWindows:api.windows}));
vi.mock('@vercel/blob',()=>({get:api.get,put:api.put,BlobPreconditionFailedError:class extends Error{}}));
import {GET,POST} from '../app/api/meta/reports/daily/route';
const account={id:'act_123',name:'Test client',currency:'CAD',status:1,timezone:'America/Toronto'};
const old={date:'2025-01-10',accountIds:[account.id],html:'previous',savedAt:'2025-01-11T00:00:00Z'};
const post=(body:unknown)=>POST(new Request('https://example.com/api/meta/reports/daily',{method:'POST',body:JSON.stringify(body)}));
beforeEach(()=>{
  vi.resetAllMocks();
  api.auth.mockResolvedValue(true);api.get.mockImplementation(async()=>({blob:{etag:'v1'},stream:new Response(JSON.stringify(old)).body}));
  api.accounts.mockResolvedValue([account]);api.put.mockResolvedValue({etag:'v2'});
  api.windows.mockImplementation(async(_a,windows)=>windows.map((window:unknown)=>({window,campaigns:[],totals:null,notes:[]})));
});
it('opens the last saved dashboard without contacting Meta',async()=>{
  expect((await (await GET()).json()).saved.html).toBe('previous');
  expect(api.accounts).not.toHaveBeenCalled();
  api.auth.mockResolvedValue(false);expect((await GET()).status).toBe(401);
});
it('retains the prior snapshot on read failure, stale version or missing account access',async()=>{
  expect((await post({version:'older'})).status).toBe(409);
  api.windows.mockRejectedValue(Error('source failed'));expect((await post({version:'v1'})).status).toBe(502);
  api.accounts.mockResolvedValue([]);expect((await post({version:'v1'})).status).toBe(403);
  expect(api.put).not.toHaveBeenCalled();
});
it('refreshes the saved selection and performs a private conditional write',async()=>{
  const response=await post({version:'v1'});
  const body=await response.json();expect(response.status).toBe(200);expect(body.saved.accountIds).toEqual(old.accountIds);
  expect(body.saved.html).toContain('Test client');expect(api.put.mock.calls[0][2]).toMatchObject({access:'private',ifMatch:'v1'});
  api.get.mockResolvedValue(null);
  expect((await post({version:null,date:'2025-01-10',accountIds:[account.id]})).status).toBe(200);
  expect(api.put.mock.calls[1][2].allowOverwrite).toBe(false);
});
it('matches elapsed days for partial baselines and uses complete prior calendar months',()=>{
  expect(comparisonWindow({since:'2025-01-01',until:'2025-01-11',partial:true})).toEqual({since:'2024-12-01',until:'2024-12-11'});
  expect(comparisonWindow({since:'2024-03-01',until:'2024-03-31'}).until).toBe('2024-02-29');
});
