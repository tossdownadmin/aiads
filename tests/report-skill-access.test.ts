import {beforeEach,expect,it,vi} from 'vitest';
const api=vi.hoisted(()=>({auth:vi.fn(),get:vi.fn()}));
vi.mock('../lib/auth',()=>({verifyAdminSession:api.auth}));vi.mock('@vercel/blob',()=>({get:api.get}));
import {GET} from '../app/api/meta/reports/runs/route';
beforeEach(()=>{vi.resetAllMocks();api.auth.mockResolvedValue(true);api.get.mockImplementation(async()=>({stream:new Response('{"privateEvidence":true}').body}));});
it('authenticates private execution records and rejects arbitrary paths',async()=>{
 api.auth.mockResolvedValue(false);expect((await GET(new Request('https://example.com?runId=x'))).status).toBe(401);api.auth.mockResolvedValue(true);
 expect((await GET(new Request('https://example.com?runId=../../other'))).status).toBe(400);expect(api.get).not.toHaveBeenCalled();
 const id='57016435-4f70-4590-b1d1-8776beaf6588';const response=await GET(new Request('https://example.com?runId='+id+'&file=evidence'));
 expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('private, no-store');expect(api.get.mock.calls[0]).toEqual(['reports/skill-runs/'+id+'/evidence.json',{access:'private',useCache:false}]);
});
