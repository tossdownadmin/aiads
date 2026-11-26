import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({session:vi.fn(),discover:vi.fn(),refresh:vi.fn()}));
vi.mock('../lib/competitors/auth',()=>({paidSourceSession:mocks.session}));
vi.mock('../lib/monitoring/provider',()=>({discoverMonitorAccounts:mocks.discover}));
vi.mock('../lib/monitoring/service',async(importOriginal)=>({...await importOriginal<typeof import('../lib/monitoring/service')>(),refreshAccount:mocks.refresh}));
import {GET,POST} from '../app/api/monitoring/route';
import {GET as cron} from '../app/api/monitoring/cron/route';
beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue(null);});
it('requires the existing allowlisted session before reads or refreshes',async()=>{
 expect((await GET(new Request('https://tool.test/api/monitoring'))).status).toBe(401);expect((await POST(new Request('https://tool.test/api/monitoring',{method:'POST',body:'{}'}))).status).toBe(401);expect(mocks.discover).not.toHaveBeenCalled();expect(mocks.refresh).not.toHaveBeenCalled();
});
it('rejects cross-origin and unassigned refreshes before any ad read',async()=>{
 mocks.session.mockResolvedValue({user:{email:'approved@example.com'}});expect((await POST(new Request('https://tool.test/api/monitoring',{method:'POST',headers:{Origin:'https://other.test'},body:'{}'}))).status).toBe(403);expect(mocks.discover).not.toHaveBeenCalled();
 mocks.discover.mockResolvedValue([{id:'act_999',currency:'CAD',name:'Foreign',status:1}]);expect((await POST(new Request('https://tool.test/api/monitoring',{method:'POST',body:JSON.stringify({accountId:'act_999',period:'7d'})}))).status).toBe(503);expect(mocks.refresh).not.toHaveBeenCalled();
});
it('does not treat a normal session as cron authorization',async()=>{
 expect((await cron(new Request('https://tool.test/api/monitoring/cron'))).status).toBe(401);expect(mocks.discover).not.toHaveBeenCalled();
});
