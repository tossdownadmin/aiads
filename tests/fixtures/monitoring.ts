import type {Sources,SourceKey,Row} from '../../lib/monitoring/types';
export const account={id:'act_123',name:'Synthetic Meta account',currency:'CAD',timezone:'America/Toronto',status:1};
export const window={since:'2026-11-20',until:'2026-11-26'},previous={since:'2026-11-13',until:'2026-11-19'};
export const now=new Date('2026-11-27T15:00:00Z');
export const context={accountId:'act_123',currency:'CAD',businessGoal:'Generate valid inquiries',primaryOutcome:'leads' as const,conversionDefinition:'Meta-reported lead, not qualified',qualificationNotes:'',targetCpl:10,monthlyBudget:1000,budgetMonth:'2026-11',targetOwner:'Synthetic owner',approvedOn:'2026-11-01',validUntil:'2026-12-31',updatedAt:'2026-11-01T00:00:00Z'};
export function input() {
  const row=(range=window):Row=>({account_id:'123',account_currency:'CAD',date_start:range.since,date_stop:range.until,spend:'100',impressions:'2000',reach:'1000',frequency:'2',clicks:'40',ctr:'2',cpc:'2.5',actions:[{action_type:'lead',value:'20'}]});
  const values:Record<SourceKey,Row[]>={
    account:[{id:'act_123',name:account.name,account_status:1,currency:'CAD',timezone_name:account.timezone}],nativeScore:[{id:'act_123',opportunity_score:70}],
    campaigns:[{id:'101',name:'Synthetic campaign',effective_status:'ACTIVE'}],adsets:[{id:'201',campaign_id:'101',optimization_goal:'LINK_CLICKS'}],ads:[{id:'301',campaign_id:'101',adset_id:'201',name:'Synthetic ad',status:'ACTIVE',effective_status:'ACTIVE'}],
    currentAccount:[row()],currentCampaigns:[{...row(),campaign_id:'101',campaign_name:'Synthetic campaign'}],currentAds:[{...row(),ad_id:'301',ad_name:'Synthetic ad',adset_id:'201',campaign_id:'101'}],
    previousAccount:[row(previous)],previousCampaigns:[{...row(previous),campaign_id:'101',campaign_name:'Synthetic campaign'}],previousAds:[{...row(previous),ad_id:'301',ad_name:'Synthetic ad',adset_id:'201',campaign_id:'101'}],monthAccount:[{...row({since:'2026-11-01',until:window.until}),spend:'200'}],
  };
  const sources=Object.fromEntries(Object.entries(values).map(([key,data])=>[key,{state:'available',path:'act_123/'+key,params:{},retrievedAt:now.toISOString(),data}])) as Sources;
  return {id:'8200000000000-11111111-1111-1111-1111-111111111111',account:{...account},period:'7d' as const,window:{...window},previous:{...previous},sources,context:{...context},startedAt:now.toISOString(),now};
}
