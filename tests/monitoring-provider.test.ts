import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {collectMonitorSources,monitoringWindows,discoverMonitorAccounts} from '../lib/monitoring/provider';
import {account,now} from './fixtures/monitoring';
beforeEach(()=>vi.stubEnv('META_SYSTEM_USER_TOKEN','never-output-this-token'));
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('uses account-timezone completed windows across year and daylight-saving boundaries',()=>{
 expect(monitoringWindows(account,'7d',new Date('2026-01-01T02:00:00Z'))).toMatchObject({window:{since:'2025-12-24',until:'2025-12-30'},previous:{since:'2025-12-17',until:'2025-12-23'}});
 expect(monitoringWindows({...account,timezone:'Asia/Karachi'},'30d',new Date('2026-01-01T02:00:00Z')).window).toEqual({since:'2025-12-02',until:'2025-12-31'});
 expect(()=>monitoringWindows({...account,timezone:undefined},'7d',now)).toThrow('timezone');
});
it('reads only GET with server authorization, explicit dates and matching attribution',async()=>{
 const fetch=vi.fn(async(url:URL,options:RequestInit)=>new Response(JSON.stringify(url.pathname.endsWith('/act_123')?{id:'act_123',opportunity_score:0}:{data:[]})));vi.stubGlobal('fetch',fetch);
 const result=await collectMonitorSources(account,'7d',now);expect(fetch).toHaveBeenCalledTimes(12);expect(JSON.stringify(result)).not.toContain('never-output-this-token');
 for(const [url,options] of fetch.mock.calls){expect(options.method).toBe('GET');expect((options.headers as Record<string,string>).Authorization).toBe('Bearer never-output-this-token');expect(String(url)).not.toContain('never-output-this-token');if(url.pathname.endsWith('/insights')){expect(url.searchParams.get('use_account_attribution_setting')).toBe('true');expect(url.searchParams.get('action_report_time')).toBe('impression');expect(url.searchParams.has('date_preset')).toBe(false);}}
});
it('discards incomplete pagination and never follows an untrusted paging URL',async()=>{
 const fetch=vi.fn(async()=>new Response(JSON.stringify({data:[{id:'act_123',name:'A',account_status:1,currency:'CAD',timezone_name:'America/Toronto'}],paging:{next:'https://untrusted.test/token',cursors:{after:'repeated'}}})));vi.stubGlobal('fetch',fetch);
 await expect(discoverMonitorAccounts()).rejects.toThrow('connection');expect(fetch).toHaveBeenCalledTimes(2);expect(fetch.mock.calls.every(call=>String(call[0]).startsWith('https://graph.facebook.com/'))).toBe(true);
});
it('keeps access/rate failures explicit and sanitizes provider responses',async()=>{
 const fetch=vi.fn(async()=>new Response(JSON.stringify({error:{message:'never-output-this-token'}}),{status:429}));vi.stubGlobal('fetch',fetch);const result=await collectMonitorSources(account,'7d',now);expect(result.sources.currentAccount).toMatchObject({state:'unavailable',data:null,reason:'rate_limit'});expect(JSON.stringify(result)).not.toContain('never-output-this-token');
});
