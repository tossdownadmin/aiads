import { afterEach, describe, expect, it, vi } from 'vitest';
import { accountToday, dailyWindows, joinCampaigns, metrics, planAmounts, planningWindow } from '../lib/reports/model';
import { readReportWindows, readTracking } from '../lib/reports/read';
import { validateProposal } from '../lib/reports/plan';

describe('report dates and metrics', () => {
  it('reproduces the daily reference windows including both end dates', () => {
    expect(dailyWindows('2026-11-10','2026-11-19')).toEqual([{ since:'2026-11-04', until:'2026-11-10' }, { since:'2026-10-12', until:'2026-11-10' }]);
    expect(accountToday('America/New_York',new Date('2026-11-19T02:00:00Z'))).toBe('2026-11-18');
    expect(() => dailyWindows('2026-02-30','2026-11-19')).toThrow();
    expect(() => dailyWindows('2026-11-19','2026-11-19')).toThrow();
  });
  it('distinguishes a complete calendar month from a partial baseline', () => {
    expect(planningWindow('2026-11','2026-11-19')).toEqual({since:'2026-10-01',until:'2026-10-31',partial:false});
    expect(planningWindow('2026-12','2026-11-19')).toEqual({since:'2026-11-01',until:'2026-11-18',partial:true});
    expect(() => planningWindow('2027-01','2026-11-19')).toThrow();
  });
  it('preserves unreported values, explicit zeros and overlapping action aliases', () => {
    const m = metrics({ spend:'10', actions:[{action_type:'purchase',value:'2'},{action_type:'omni_purchase',value:'2'},{action_type:'lead',value:'0'}],action_values:[{action_type:'omni_purchase',value:'24'}] });
    expect(m).toMatchObject({purchases:2,leads:0,roas:2.4,reach:null});
    expect(metrics({}).purchases).toBeNull();
  });
  it('reads Facebook Page visits from Meta results without adding attribution alternatives',()=>{
    expect(metrics({results:[{indicator:'page_visit_view',values:[{value:'90'}]}]}).facebookVisits).toBe(90);
    expect(metrics({results:[{indicator:'actions:page_visit_view',values:[{value:'0'}]}]}).facebookVisits).toBe(0);
    expect(metrics({results:[{indicator:'page_visit_view',values:[{value:'90'},{value:'85'}]}]}).facebookVisits).toBeNull();
    expect(metrics({results:[{indicator:'profile_visit_view',values:[{value:'90'}]}]}).facebookVisits).toBeNull();
    expect(metrics({results:[{indicator:'profile_visit_view',values:[{value:'90'}]}]}).instagramVisits).toBe(90);
    expect(metrics({actions:[{action_type:'page_visit',value:'80'}],results:[{indicator:'page_visit_view',values:[{value:'90'}]}]}).facebookVisits).toBe(90);
  });
  it('joins on IDs and preserves historical delivery, orphaned insight rows and active no-row campaigns', () => {
    const cfg = (id:string,status:string,start:string) => ({ id,name:id,status,effective_status:status,start_time:start });
    const rows = joinCampaigns([cfg('paused','PAUSED','2026-01-01'),cfg('quiet','ACTIVE','2026-01-01'),cfg('future','ACTIVE','2026-11-15'),{...cfg('ended','ACTIVE','2026-01-01'),stop_time:'2026-09-30'}],[{campaign_id:'paused',spend:'5'},{campaign_id:'deleted',spend:'1'}],{since:'2026-10-01',until:'2026-10-31'});
    expect(rows.map(r=>r.id)).toEqual(['paused','deleted','quiet']);
    expect(rows[1].status).toBe('Unknown'); expect(rows[2].spend).toBeNull();
  });
  it('keeps draft budgets within the cap and tied to existing campaigns', () => {
    const allocation = [33,33,34].map((percent,i)=>({campaignId:String(i),percent,rationale:'sample'}));
    const plan = {summary:'summary',financialReview:'review',performance:[],competitors:[],event:'unavailable',allocation,concepts:[],takeaways:[],gaps:[]};
    expect(validateProposal(plan,['0','1','2'],100.01).allocation).toHaveLength(3);
    expect(planAmounts(allocation,100.01,'USD').map(x=>Math.round(100*x)).reduce((a,b)=>a+b,0)).toBe(10001);
    expect(()=>validateProposal(plan,['0'],100)).toThrow();expect(()=>validateProposal(plan,['0','1','2'])).toThrow();
  });
});

describe('Meta report reader', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it('reads both aggregate levels and follows only real next pages', async () => {
    vi.stubEnv('META_SYSTEM_USER_TOKEN','unit-test');
    const calls:URL[] = [];
    vi.stubGlobal('fetch',async (url:URL) => {
      calls.push(url); const level=url.searchParams.get('level');
      const data = url.pathname.endsWith('/campaigns') ? [{id:'a',name:'A',effective_status:'PAUSED'}] : level==='campaign' ? [{campaign_id:'a',spend:'4'}] : [{spend:'4',reach:'11',frequency:'1.1'}];
      return Response.json({data,paging:{cursors:{after:'last'}}});
    });
    const [report]=await readReportWindows({id:'act_1',name:'A',currency:'USD',status:1},[{since:'2026-11-01',until:'2026-11-10'}]);
    expect(calls).toHaveLength(8);expect(report.details?.a).toBeDefined();expect(report.totals?.reach).toBe(11);expect(report.campaigns[0].status).toBe('PAUSED');
  });
  it('distinguishes inaccessible datasets from an empty visible list', async () => {
    vi.stubEnv('META_SYSTEM_USER_TOKEN','unit-test');vi.stubGlobal('fetch',async()=>Response.json({error:{message:'Denied'}},{status:403}));
    expect((await readTracking('act_1')).pixels).toBeNull();
    vi.stubGlobal('fetch',async()=>Response.json({data:[]}));expect((await readTracking('act_1')).pixels).toEqual([]);
  });
});
