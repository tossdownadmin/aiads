import {expect,it} from 'vitest';
import {resultKind} from '../lib/reports/daily-metrics';
import {dailyEvidence,validateDailyAnalysis} from '../lib/reports/daily-analysis';
import {joinCampaigns,metrics,type Report} from '../lib/reports/model';
import {evaluateMonitor} from '../lib/monitoring/engine';
import {input} from './fixtures/monitoring';
it('does not select results from a campaign name, broad objective, business label or incidental outcomes',()=>{
 const row={name:'Sales purchases Instagram profile WhatsApp leads',objective:'OUTCOME_SALES',settings:undefined,conversations:10,thruplays:20};
 expect(resultKind(row)).toBeUndefined();
 expect(resultKind({...row,settings:{goals:['PROFILE_VISIT'],bids:[]}})).toBeUndefined();
 expect(resultKind({...row,settings:{goals:['LINK_CLICKS','THRUPLAY'],bids:[]}})).toBeUndefined();
 expect(resultKind({...row,settings:{goals:['LINK_CLICKS'],bids:[],primary:null}})).toBeUndefined();
});
it('retains exact direct Instagram measurements, including zero, with source field provenance',()=>{
 const data=input();data.sources.adsets.data![0]={...data.sources.adsets.data![0],optimization_goal:'PROFILE_VISIT',destination_type:'INSTAGRAM_PROFILE'};
 data.sources.currentCampaigns.data![0].instagram_profile_visits='0';
 const result=evaluateMonitor(data),campaign=result.campaignOutcomes![0];
 expect(campaign.outcome).toBe('instagramVisits');expect(campaign.state).toBe('reported');
 const fact=result.evidence.find(f=>f.id===campaign.resultId)!;expect(fact.value).toBe('0');expect(fact.field).toBe('instagram_profile_visits');
 expect(result.evidence.find(f=>f.id===campaign.costId)!.value).toBeNull();
});
it('gives exact website outcomes their own scalar evidence and prevents substituting leads or purchases',()=>{
 const window={since:'2026-11-20',until:'2026-11-26'};
 const rows=joinCampaigns([],[{campaign_id:'101',spend:'100',actions:[{action_type:'offsite_conversion.fb_pixel_purchase',value:'4'},{action_type:'omni_purchase',value:'6'}]}],window,new Map([['101',{goals:['OFFSITE_CONVERSIONS'],bids:[],primary:{metric:'websitePurchases',label:'Website purchases',scale:'1'}}]]));
 const report:Report={account:{id:'act_123',name:'Synthetic',currency:'CAD',status:1},generated:'2026-11-27',periods:[{window,totals:metrics(),campaigns:rows,notes:[]}]};
 const evidence=dailyEvidence(report);expect(resultKind(rows[0])).toBe('websitePurchases');
 expect(evidence.facts.find(f=>f.id==='window0:campaign:101:cost-per-result')?.value).toBe(25);
 const response=(interpretation:string,id:string)=>({periods:[{periodId:'window0',findings:[{tone:'ok',title:'Source result',interpretation,evidenceIds:[id],action:'Review source data',reason:'Use reported outcomes'}]}]});
 expect(validateDailyAnalysis(response('Website purchases were {{window0:campaign:101:websitePurchases}}.','window0:campaign:101:websitePurchases'),evidence)[0].findings[0].interpretation).toContain('4');
 expect(()=>validateDailyAnalysis(response('Website purchases were {{window0:campaign:101:purchases}}.','window0:campaign:101:purchases'),evidence)).toThrow('unit mismatch');
});
