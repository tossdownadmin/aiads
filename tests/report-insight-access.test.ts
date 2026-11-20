import { beforeEach, expect, it, vi } from 'vitest';
const api=vi.hoisted(()=>({auth:vi.fn(),accounts:vi.fn(),insights:vi.fn()}));
vi.mock('../lib/auth',()=>({verifyAdminSession:api.auth}));
vi.mock('../lib/meta/read',()=>({getAdAccounts:api.accounts,fetchAllPages:api.insights}));
import { GET } from '../app/api/meta/reports/route';
const request=(query='accountId=act_123&since=2026-11-13&until=2026-11-19')=>new Request('https://example.com/api/meta/reports?'+query);
beforeEach(()=>{vi.resetAllMocks();api.auth.mockResolvedValue(true);api.accounts.mockResolvedValue([{id:'act_123',name:'Client',currency:'USD',timezone:'America/New_York'}]);api.insights.mockResolvedValue([]);});
it('requires an approved session before looking up any insight evidence',async()=>{
 api.auth.mockResolvedValue(false);expect((await GET(request())).status).toBe(401);expect(api.accounts).not.toHaveBeenCalled();expect(api.insights).not.toHaveBeenCalled();
});
it('rejects invalid windows and accounts unavailable to the token',async()=>{
 expect((await GET(request('accountId=act_123&since=2026-02-30&until=2026-11-19'))).status).toBe(400);expect(api.accounts).not.toHaveBeenCalled();
 expect((await GET(request('accountId=act_999&since=2026-11-13&until=2026-11-19'))).status).toBe(403);expect(api.insights).not.toHaveBeenCalled();
});
it('reconciles exact dates using ad-set attribution and private responses',async()=>{
 const response=await GET(request());expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('private, no-store');
 expect(api.insights).toHaveBeenCalledWith('act_123/insights',expect.objectContaining({level:'adset',use_unified_attribution_setting:'true',fields:expect.stringContaining('results'),time_range:JSON.stringify({since:'2026-11-13',until:'2026-11-19'})}));
});
