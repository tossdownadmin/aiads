import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const api=vi.hoisted(()=>({auth:vi.fn(),accounts:vi.fn(),catalog:vi.fn(),write:vi.fn(),windows:vi.fn()}));
vi.mock('../lib/competitors/auth',()=>({paidSourceSession:api.auth}));
vi.mock('../lib/meta/read',()=>({getAdAccounts:api.accounts}));
vi.mock('../lib/competitors/store',()=>({readClientCatalog:api.catalog,writeClientCatalog:api.write,readClientBoard:vi.fn(),readCompetitors:vi.fn(),LibraryConflict:class extends Error{}}));
vi.mock('../lib/reports/read',()=>({readReportWindows:api.windows,readTracking:vi.fn(),readComparison:vi.fn()}));
vi.mock('../lib/reports/plan',()=>({draftPlan:vi.fn()}));
import {POST,PUT} from '../app/api/competitors/clients/route';
import {GET as accountsList} from '../app/api/meta/accounts/route';
import {POST as monthlyReport} from '../app/api/meta/reports/route';
const account={id:'act_123',name:'Actual Meta account name',currency:'CAD',status:1};
const old={id:'existing-library',name:'Earlier brand label',market:'Toronto',country:'CA',evidence:'https://example.com',competitors:[{name:'Example',domain:'example.com',evidence:'https://example.com'}]};
const request=(body:unknown)=>new Request('https://example.com',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv('META_SYSTEM_USER_TOKEN','test');api.auth.mockResolvedValue({user:{email:'approved@example.com'}});api.accounts.mockResolvedValue([account]);api.catalog.mockResolvedValue({value:{clients:[old]},version:'v1'});api.write.mockImplementation(async(clients)=>({clients,version:'v2'}));
});
afterEach(()=>vi.unstubAllEnvs());
it('uses the token account list behind approved sign-in',async()=>{
 expect((await (await accountsList()).json()).accounts).toEqual([account]);api.auth.mockResolvedValue(null);expect((await accountsList()).status).toBe(401);expect((await POST(request({accountId:account.id,version:'v1'}))).status).toBe(401);expect(api.write).not.toHaveBeenCalled();
});
it('derives new client identity from the accessible account, without trusting typed metadata',async()=>{
 const response=await POST(request({accountId:account.id,version:'v1',name:'Forged name',country:'US'}));const result=await response.json();expect(response.status).toBe(200);expect(result.selectedClientId).toBe('meta-123');expect(result.clients[1]).toMatchObject({name:account.name,metaAccountId:account.id,currency:'CAD',country:'',market:'',evidence:''});expect(api.write.mock.calls[0][1]).toBe('v1');
});
it('links an existing library by preserving its storage ID and research context',async()=>{
 const result=await (await POST(request({accountId:account.id,existingClientId:old.id,version:'v1'}))).json();expect(result.clients).toHaveLength(1);expect(result.selectedClientId).toBe(old.id);expect(result.clients[0]).toMatchObject({...old,name:account.name,metaAccountId:account.id});
});
it('opens an existing account association without duplicating or overwriting it',async()=>{
 api.catalog.mockResolvedValue({value:{clients:[{...old,name:account.name,currency:account.currency,metaAccountId:account.id}]},version:'v1'});expect((await (await POST(request({accountId:account.id,version:'v1'}))).json()).selectedClientId).toBe(old.id);expect(api.write).not.toHaveBeenCalled();
});
it('rejects inaccessible accounts, stale lists and reassignment before writing',async()=>{
 expect((await POST(request({accountId:'act_999',version:'v1'}))).status).toBe(403);expect((await POST(request({accountId:account.id,version:'old'}))).status).toBe(409);
 api.catalog.mockResolvedValue({value:{clients:[{...old,metaAccountId:'act_999'}]},version:'v1'});expect((await POST(request({accountId:account.id,existingClientId:old.id,version:'v1'}))).status).toBe(409);expect(api.write).not.toHaveBeenCalled();
});
it('reports a competing conditional write as a conflict',async()=>{
 const {LibraryConflict}=await import('../lib/competitors/store');api.write.mockRejectedValue(new LibraryConflict());expect((await POST(request({accountId:account.id,version:'v1'}))).status).toBe(409);
});
it('blocks manual client creation and identity edits through metadata updates',async()=>{
 expect((await PUT(request({version:'v1',clients:[old,{...old,id:'typed-brand'}]}))).status).toBe(400);
 expect((await PUT(request({version:'v1',clients:[{...old,name:account.name,currency:account.currency,metaAccountId:account.id}]}))).status).toBe(400);expect(api.write).not.toHaveBeenCalled();
 expect((await PUT(request({version:'v1',clients:[{...old,name:'Typed new name',market:'Updated market'}]}))).status).toBe(200);expect(api.write.mock.calls[0][0][0]).toMatchObject({name:old.name,market:'Updated market'});
});
it('rejects a monthly plan library linked to another account before fetching insights',async()=>{
 api.catalog.mockResolvedValue({value:{clients:[{...old,metaAccountId:'act_999'}]},version:'v1'});
 const response=await monthlyReport(request({mode:'plan',accountId:account.id,researchClient:old.id,month:'2026-12',inputs:{brief:'',competitors:'',event:''}}));expect(response.status).toBe(400);expect(api.windows).not.toHaveBeenCalled();
});

it('refreshes a linked account name from Meta when selected again',async()=>{
 api.catalog.mockResolvedValue({value:{clients:[{...old,metaAccountId:account.id}]},version:'v1'});
 const result=await (await POST(request({accountId:account.id,version:'v1'}))).json();expect(result.clients[0].name).toBe(account.name);expect(result.selectedClientId).toBe(old.id);
});
