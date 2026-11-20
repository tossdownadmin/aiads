import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { joinCampaigns, metrics } from '../lib/reports/model';
import { getReportingSkills, skillVersion } from '../lib/skills/report-packages';

const api=vi.hoisted(()=>({auth:vi.fn(),accounts:vi.fn(),context:vi.fn(),windows:vi.fn(),skill:vi.fn(),analyze:vi.fn()}));
vi.mock('../lib/auth',()=>({verifyAdminSession:api.auth}));
vi.mock('../lib/meta/read',()=>({getAdAccounts:api.accounts,fetchAllPages:vi.fn()}));
vi.mock('../lib/reports/client-context',()=>({readClientContext:api.context}));
vi.mock('../lib/reports/read',()=>({readDailyReview:api.windows,readReportWindows:vi.fn(),readComparison:vi.fn(),readTracking:vi.fn()}));
vi.mock('../lib/skills/report-runner',()=>({selectReportSkill:api.skill}));
// Keep real evidence construction and partitioning so the route is tested with
// actual small/large reports rather than a mocked batch-count decision.
vi.mock('../lib/reports/daily-analysis',async importOriginal=>({...await importOriginal<typeof import('../lib/reports/daily-analysis')>(),analyzeDailyReport:api.analyze}));
import { POST } from '../app/api/meta/reports/route';

const account={id:'act_123',name:'Direct daily client',currency:'CAD',status:1,timezone:'America/Toronto'};
const approvedContext={accountId:account.id,currency:account.currency,businessGoal:'Acquire quote requests',qualificationNotes:'Team-reported context',targetCpa:25,targetCpl:15,targetRoas:3,monthlyBudget:900,budgetMonth:'2025-01',updatedAt:'2025-01-09T00:00:00Z'};
const post=(extra={})=>POST(new Request('https://example.com/api/meta/reports',{
  method:'POST',body:JSON.stringify({mode:'daily',accountId:account.id,end:'2025-01-10',...extra}),
}));
const snapshots=(number:number)=>(_account:unknown,windows:Parameters<typeof joinCampaigns>[2][])=>windows.map(window=>({
  window,totals:metrics({spend:'100',impressions:'10000'}),notes:[],
  campaigns:joinCampaigns([],Array.from({length:number},(_,i)=>({
    campaign_id:String(i),campaign_name:'Campaign '+i,objective:'OUTCOME_LEADS',spend:'100',impressions:'10000',actions:[{action_type:'lead',value:'5'}],
  })),window),
}));
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv('META_SYSTEM_USER_TOKEN','test-connection');
  api.auth.mockResolvedValue(true);api.accounts.mockResolvedValue([account]);api.context.mockResolvedValue(null);
  api.skill.mockResolvedValue(getReportingSkills()[0]);api.windows.mockImplementation(snapshots(1));
  api.analyze.mockImplementation(async(report,skill)=>({
    run:{id:'direct-analysis',skill:skillVersion(skill)},
    periods:report.periods.map((_p:unknown,i:number)=>({periodId:'window'+i,findings:[]})),
  }));
});
afterEach(()=>vi.unstubAllEnvs());

it('requires an approved session and connected account before reading business context',async()=>{
  api.auth.mockResolvedValueOnce(false);expect((await post()).status).toBe(401);expect(api.accounts).not.toHaveBeenCalled();
  expect((await post({accountId:'act_999'})).status).toBe(403);
  expect(api.context).not.toHaveBeenCalled();expect(api.windows).not.toHaveBeenCalled();expect(api.analyze).not.toHaveBeenCalled();
});

it('fails safely on a context outage and retries with the saved targets after recovery',async()=>{
  const privateFailure='Blob connection failed; Bearer private-token';
  api.context.mockRejectedValueOnce(Error(privateFailure));
  const response=await post(),body=await response.json();
  expect(response.status).toBe(503);expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(body.error).toContain('Saved business context could not be loaded');expect(body.error).toContain('Retry');
  expect(JSON.stringify(body)).not.toContain(privateFailure);
  expect(api.windows).not.toHaveBeenCalled();expect(api.analyze).not.toHaveBeenCalled();

  api.context.mockResolvedValue(approvedContext);
  const resumed=await post();expect(resumed.status).toBe(200);
  expect(api.context).toHaveBeenCalledTimes(2);
  expect(api.windows.mock.calls[0][2]).toEqual(approvedContext);
  expect(api.analyze.mock.calls[0][0].reviewContext).toEqual(approvedContext);
});

it('keeps the direct endpoint usable for a single batch with genuinely missing optional context',async()=>{
  const response=await post(),body=await response.json();
  expect(response.status).toBe(200);
  expect(api.analyze).toHaveBeenCalledTimes(1);expect(api.analyze.mock.calls[0][0].reviewContext).toBeNull();
  expect(body.report.reviewContext).toBeNull();expect(body.report.dailySkillRun.id).toBe('direct-analysis');expect(body.report.periods).toHaveLength(2);
});

it('redirects large evidence to resumable saved updates after retrieval and before any model analysis',async()=>{
  api.windows.mockImplementation(snapshots(180));
  const response=await post(),body=await response.json();
  expect(response.status).toBe(409);expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(body.error).toContain('Use saved daily report update for resumable analysis');
  expect(api.windows).toHaveBeenCalledTimes(1);expect(api.analyze).not.toHaveBeenCalled();
  expect(body).not.toHaveProperty('report');
});
