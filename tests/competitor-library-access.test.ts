import {beforeEach,expect,it,vi} from 'vitest';
const api=vi.hoisted(()=>({auth:vi.fn(),head:vi.fn(),get:vi.fn(),put:vi.fn()}));
vi.mock('../lib/competitors/auth',()=>({paidSourceSession:api.auth}));
vi.mock('@vercel/blob',()=>({head:api.head,get:api.get,put:api.put,BlobNotFoundError:class extends Error{},BlobPreconditionFailedError:class extends Error{}}));
import {GET,PUT} from '../app/api/competitors/selection/route';
import {PUT as saveClients} from '../app/api/competitors/clients/route';
const old={competitors:[{id:'brand',name:'CAVA',domain:'cava.com',reviewed:true}]};
const put=(body:unknown)=>PUT(new Request('https://example.com',{method:'PUT',body:JSON.stringify(body)}));
beforeEach(()=>{vi.resetAllMocks();api.auth.mockResolvedValue({user:{email:'approved@example.com'}});api.head.mockResolvedValue({etag:'v1'});api.get.mockImplementation(async(path:string)=>({stream:new Response(JSON.stringify(path.includes('clients-v1')?{clients:[{id:'andshawarma'}]}:old)).body}));api.put.mockResolvedValue({etag:'v2'});});
it('requires approved sign-in before reading or changing the shared library',async()=>{
 api.auth.mockResolvedValue(null);expect((await GET(new Request('https://example.com?clientId=andshawarma'))).status).toBe(401);expect((await put({})).status).toBe(401);expect(api.get).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();
});
it('returns legacy saved mappings without rewriting them and rejects stale or absent versions',async()=>{
 const result=await (await GET(new Request('https://example.com?clientId=andshawarma'))).json();expect(result.searches).toEqual([]);expect(result.competitors).toEqual(old.competitors);expect(result.version).toBe('v1');
 expect((await put({clientId:'andshawarma',...old,version:'older'})).status).toBe(409);expect((await put({clientId:'andshawarma',...old})).status).toBe(400);expect(api.put).not.toHaveBeenCalled();
});
it('conditionally saves approved edits and reports storage races as conflicts',async()=>{
 const next={clientId:'andshawarma',version:'v1',...old,searches:[{id:'saved-query',name:'Catering',query:'shawarma catering'}]};expect((await put(next)).status).toBe(200);
 expect(api.put.mock.calls[0][2]).toMatchObject({access:'private',ifMatch:'v1'});expect(JSON.parse(api.put.mock.calls[0][1])).toMatchObject({reviewedBy:'approved@example.com',searches:next.searches});
 const {BlobPreconditionFailedError}=await import('@vercel/blob');api.put.mockRejectedValue(new BlobPreconditionFailedError());expect((await put(next)).status).toBe(409);
});
it('rejects unknown clients, repeated identities, and unsafe client URLs',async()=>{
 expect((await put({clientId:'missing',version:'v1',...old})).status).toBe(404);
 expect((await put({clientId:'andshawarma',version:'v1',competitors:[...old.competitors,{...old.competitors[0],id:'second',brandIds:['brand']}]})).status).toBe(400);
 expect((await saveClients(new Request('https://example.com',{method:'PUT',body:JSON.stringify({version:'v1',clients:[{id:'andshawarma',name:'Client',market:'US',country:'US',evidence:'javascript:alert(1)'}]})}))).status).toBe(400);expect(api.put).not.toHaveBeenCalled();
});
