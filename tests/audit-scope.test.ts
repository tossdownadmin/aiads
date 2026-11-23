import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const api=vi.hoisted(()=>({auth:vi.fn(),accounts:vi.fn(),skills:vi.fn(),read:vi.fn(),context:vi.fn(),analysis:vi.fn()}));
vi.mock('../lib/auth',()=>({verifyAdminSession:api.auth}));
vi.mock('../lib/meta/read',()=>({getAdAccounts:api.accounts}));
vi.mock('../lib/skills/store',()=>({listApprovedSkills:api.skills}));
vi.mock('../lib/reports/read',()=>({readDailyReview:api.read}));
vi.mock('../lib/reports/client-context',()=>({readClientContext:api.context}));
vi.mock('../lib/reports/audit-analysis',async original=>({...await original<typeof import('../lib/reports/audit-analysis')>(),analyzeAccountAudit:api.analysis}));
import {POST} from '../app/api/meta/audit/route';
import {metrics} from '../lib/reports/model';
const account={id:'act_123',name:'Example',currency:'CAD',status:1,timezone:'America/Toronto'};
const request=(patch={})=>new Request('https://example.com/api/meta/audit',{method:'POST',body:JSON.stringify({accountId:account.id,skillName:'meta-account-audit',period:'last_7d',...patch})});
const c=(id:string,status:string,spend:number)=>({id,name:id,status,objective:'OUTCOME_LEADS',hasInsights:true,start:null,stop:null,...metrics({spend,impressions:100,actions:[{action_type:'lead',value:1}]})});
beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv('META_SYSTEM_USER_TOKEN','synthetic-token');
 api.auth.mockResolvedValue(true);api.accounts.mockResolvedValue([account]);api.skills.mockResolvedValue([{name:'meta-account-audit',categories:['analysis'],platforms:['meta'],writeActions:false,risk:'low',body:'Read only'}]);
 api.context.mockResolvedValue(null);api.analysis.mockResolvedValue({status:'complete',findings:[]});
 api.read.mockImplementation(async(_a,windows)=>[{window:windows[0],totals:metrics({spend:150,impressions:200}),campaigns:[c('active','ACTIVE',50),c('paused','PAUSED',100)],notes:[],details:{},previous:{window:{since:'2026-11-09',until:'2026-11-15'},totals:metrics({spend:100}),campaigns:[]}}]);
});
afterEach(()=>vi.unstubAllEnvs());
it('includes paused period spend by default and uses exact completed account-local dates',async()=>{
 const response=await POST(request()),body=await response.json();
 expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('private, no-store');
 expect(body.scope).toBe('period');expect(body.summary.totalSpend).toBe(150);expect(body.campaigns.map((c:any)=>c.id)).toEqual(['active','paused']);
 expect(body.window.until<new Intl.DateTimeFormat('en-CA',{timeZone:account.timezone}).format(new Date())).toBe(true);
 expect(api.read.mock.calls[0][1][0]).toEqual(body.window);expect(api.context).toHaveBeenCalledWith(account.id);
});
it('keeps an active-only selection explicit and does not inherit account-wide totals',async()=>{
 const body=await (await POST(request({scope:'active'}))).json();
 expect(body.summary.totalSpend).toBe(50);expect(body.campaigns).toHaveLength(1);expect(api.analysis.mock.calls[0][0].periods[0].totals).toBeNull();expect(body.notice).toContain('selected currently active');
});
it('keeps missing spend unavailable instead of manufacturing zero',async()=>{
 api.read.mockImplementation(async(_a,windows)=>[{window:windows[0],totals:null,campaigns:[],notes:['No insight row'],details:{}}]);
 const body=await (await POST(request())).json();expect(body.summary.totalSpend).toBeNull();expect(body.readiness.status).toBe('incomplete');
});
it('enforces authorization before source reads and never accepts write-enabled methods',async()=>{
 api.auth.mockResolvedValue(false);expect((await POST(request())).status).toBe(401);expect(api.accounts).not.toHaveBeenCalled();
 api.auth.mockResolvedValue(true);api.skills.mockResolvedValue([{name:'meta-account-audit',categories:['analysis'],platforms:['meta'],writeActions:true}]);
 expect((await POST(request())).status).toBe(400);expect(api.read).not.toHaveBeenCalled();
});
