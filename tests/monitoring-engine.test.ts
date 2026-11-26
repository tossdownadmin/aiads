import {expect,it} from 'vitest';
import {evaluateMonitor} from '../lib/monitoring/engine';
import {input} from './fixtures/monitoring';
it('computes an inspectable source and delivery score with separate performance checks',()=>{
  const result=evaluateMonitor(input());expect(result.integrity).toBe('verified');expect(result.score).toBe(100);expect(result.nativeScore).toBe('70');expect(result.coverage.percent).toBe(100);expect(result.findings).toHaveLength(0);
  expect(result.skill.hash).toMatch(/^[a-f0-9]{64}$/);expect(new Set(result.evidence.map(f=>f.id)).size).toBe(result.evidence.length);
  const known=new Set(result.evidence.map(f=>f.id));expect(result.checks.flatMap(c=>c.evidenceIds).every(id=>known.has(id))).toBe(true);expect(result.evidence.flatMap(f=>f.inputs||[]).every(id=>known.has(id))).toBe(true);
});
it('keeps native Meta scores separate and preserves an explicitly returned zero',()=>{
  const data=input();data.sources.nativeScore.data![0].opportunity_score=0;expect(evaluateMonitor(data).nativeScore).toBe('0');data.sources.nativeScore.data=null;data.sources.nativeScore.state='unavailable';const result=evaluateMonitor(data);expect(result.nativeScore).toBeNull();expect(result.score).toBe(100);
});
it('withholds delivery scores for missing scored sources or failed spend reconciliation, not optional performance sources',()=>{
  const data=input();data.sources.currentCampaigns.data![0].spend='100.01';let result=evaluateMonitor(data);expect(result.score).toBeNull();expect(result.integrity).toBe('mismatch');expect(result.findings.some(f=>f.ruleId==='source-reconciliation'&&f.priority==='critical')).toBe(true);
  data.sources.currentCampaigns.data![0].spend='100';data.sources.previousAccount.data=null;data.sources.previousAccount.state='unavailable';result=evaluateMonitor(data);expect(result.integrity).toBe('verified');expect(result.score).toBe(100);expect(result.coverage.percent).toBeLessThan(100);
  data.sources.ads.data=null;data.sources.ads.state='unavailable';expect(evaluateMonitor(data).score).toBeNull();
});
it('never makes an absent row, omitted action, duplicate action or zero denominator a zero-result conclusion',()=>{
  for(const kind of ['missing-row','missing-action','duplicate-action','zero'] as const){const data=input();if(kind==='missing-row')data.sources.currentAccount.data=[];else data.sources.currentAccount.data![0].actions=kind==='missing-action'?[]:kind==='duplicate-action'?[{action_type:'lead',value:'1'},{action_type:'lead',value:'2'}]:[{action_type:'lead',value:'0'}];
    const result=evaluateMonitor(data),cost=result.evidence.find(f=>f.metric==='costPerResult'&&f.id.startsWith('current:'))!;expect(cost.value).toBeNull();if(kind!=='zero')expect(result.findings.some(f=>f.explanation.includes('explicitly returned zero'))).toBe(false);
  }
});
it.each(['currency','account','dates','duplicate','malformed'])('rejects %s corruption in Meta insight identity',kind=>{
  const data=input(),row=data.sources.currentAccount.data![0];if(kind==='currency')row.account_currency='USD';if(kind==='account')row.account_id='999';if(kind==='dates')row.date_stop='2026-11-27';if(kind==='duplicate')data.sources.currentAccount.data!.push({...row});if(kind==='malformed')row.spend='secret-token';
  const result=evaluateMonitor(data);expect(result.score).toBeNull();expect(result.integrity).toBe('unavailable');expect(result.evidence.find(f=>f.metric==='spend'&&f.id.startsWith('current:account'))!.value).toBeNull();expect(result.limitations.join(' ')).not.toContain('secret-token');
});
it('includes paused campaign spend and refuses to add reach/frequency across entities',()=>{
  const data=input();data.sources.campaigns.data![0].effective_status='PAUSED';data.sources.currentCampaigns.data![0].spend='0.1';data.sources.currentCampaigns.data!.push({...data.sources.currentCampaigns.data![0],campaign_id:'102',spend:'0.2'});data.sources.currentAccount.data![0].spend='0.3';const result=evaluateMonitor(data);expect(result.integrity).toBe('verified');expect(result.evidence.find(f=>f.metric==='campaignSpendSum')!.value).toBe('0.3');expect(result.evidence.find(f=>f.id==='current:account:act_123:reach')!.value).toBe('1000');
});
it('does not use expired or wrong-currency targets or infer primary outcomes from names',()=>{
  const data=input();data.context.validUntil='2026-11-26';const expired=evaluateMonitor(data);expect(expired.checks.find(c=>c.id==='cost-target')!.state).toBe('not_applicable');expect(expired.findings.some(f=>f.ruleId==='cost-target')).toBe(false);
  data.context.currency='USD';expect(evaluateMonitor(data).context).toBeNull();const missing=input();(missing as {context:unknown}).context=null;missing.sources.currentCampaigns.data![0].campaign_name='Guaranteed winning leads';expect(evaluateMonitor(missing).evidence.find(f=>f.metric==='costPerResult')!.value).toBeNull();
});
it('uses only qualified samples, matching goals and nonoverlapping exact periods',()=>{
  const data=input();data.sources.currentAds.data![0].ctr='1.5';data.sources.currentAds.data![0].frequency='2.5';let result=evaluateMonitor(data);expect(result.findings.some(f=>f.category==='creative')).toBe(true);
  data.sources.adsets.data![0].optimization_goal='THRUPLAY';result=evaluateMonitor(data);expect(result.findings.some(f=>f.category==='creative')).toBe(false);
  data.sources.adsets.data![0].optimization_goal='LINK_CLICKS';data.sources.previousAds.data![0].impressions='999';expect(evaluateMonitor(data).findings.some(f=>f.category==='creative')).toBe(false);
  data.previous={...data.window};expect(()=>evaluateMonitor(data)).toThrow('nonoverlapping');
});
it('does not assert an efficiency trend when the previous campaign spend does not reconcile',()=>{
  const data=input();data.sources.currentAccount.data![0].spend='200';data.sources.currentCampaigns.data![0].spend='200';data.sources.currentAds.data![0].spend='200';data.sources.previousCampaigns.data![0].spend='99';const result=evaluateMonitor(data);expect(result.checks.find(c=>c.id==='efficiency-trend')!.state).toBe('unknown');expect(result.findings.some(f=>f.ruleId==='efficiency-trend')).toBe(false);
});
it('uses purchase ROAS only for a purchase outcome with its own approved target',()=>{
 const data=input();(data.context as any).primaryOutcome='purchases';(data.context as any).targetRoas=2;
 for(const key of ['currentAccount','currentCampaigns'] as const){data.sources[key].data![0].actions=[{action_type:'purchase',value:'20'}];data.sources[key].data![0].action_values=[{action_type:'purchase',value:'100'}];}
 const result=evaluateMonitor(data);expect(result.checks.find(c=>c.id==='cost-target')!.state).toBe('review');expect(result.findings.find(f=>f.ruleId==='cost-target')!.explanation).toContain('ROAS: 1.00×');expect(result.findings.find(f=>f.ruleId==='cost-target')!.evidenceIds).toContain('profile:account:act_123:roasTarget');
});

it('runs without a profile and never turns account business intent into a campaign result',()=>{
 const data=input();(data as {context:unknown}).context=null;data.account.id='act_2036318527081035';
 for(const key of ['account','nativeScore'] as const)data.sources[key].data![0].id=data.account.id;
 for(const source of Object.values(data.sources))for(const row of source.data||[])if(row.account_id)row.account_id='2036318527081035';
 const result=evaluateMonitor(data);expect(result.businessIntent).toBe('SALES');expect(result.score).toBe(100);expect(result.scoreBasis).toBe('source-and-delivery');expect(result.campaignOutcomes![0].outcome).toBe('linkClicks');expect(result.campaignOutcomes![0].state).toBe('reported');expect(result.findings.some(f=>f.category==='readiness')).toBe(false);expect(result.checks.find(c=>c.id==='cost-target')!.state).toBe('not_applicable');expect(result.checks.find(c=>c.id==='budget-usage')!.state).toBe('not_applicable');
});
it('matches website purchase events exactly instead of substituting aggregate purchases',()=>{
 const data=input();Object.assign(data.sources.adsets.data![0],{optimization_goal:'OFFSITE_CONVERSIONS',promoted_object:{pixel_id:'555',custom_event_type:'PURCHASE'}});
 data.sources.currentCampaigns.data![0].actions=[{action_type:'omni_purchase',value:'99'},{action_type:'offsite_conversion.fb_pixel_purchase',value:'4'}];
 let result=evaluateMonitor(data),goal=result.campaignOutcomes![0];expect(goal.outcome).toBe('websitePurchases');expect(result.evidence.find(f=>f.id===goal.resultId)!.value).toBe('4');expect(result.evidence.find(f=>f.id===goal.costId)!.value).toBe('25');
 data.sources.currentCampaigns.data![0].actions=[{action_type:'omni_purchase',value:'99'}];result=evaluateMonitor(data);expect(result.campaignOutcomes![0].state).toBe('unreported');expect(result.evidence.find(f=>f.id===result.campaignOutcomes![0].costId)!.value).toBeNull();
});
it('uses the campaign reach denominator and labels cost per thousand without summing audience reach',()=>{
 const data=input();data.sources.adsets.data![0].optimization_goal='REACH';const result=evaluateMonitor(data),goal=result.campaignOutcomes![0],cost=result.evidence.find(f=>f.id===goal.costId)!;expect(goal.outcome).toBe('reach');expect(cost.label).toBe('Cost per 1,000 reach');expect(cost.value).toBe('100');
});
it('raises campaign trends without manual targets and keeps blended account outcomes out of the comparison',()=>{
 const data=input();(data as {context:unknown}).context=null;data.sources.currentAccount.data![0].spend='200';data.sources.currentCampaigns.data![0].spend='200';data.sources.currentAds.data![0].spend='200';const result=evaluateMonitor(data),signal=result.findings.find(f=>f.ruleId==='efficiency-trend')!;expect(signal.entityId).toBe('101');expect(signal.explanation).toContain('CAD 10.00');expect(signal.explanation).toContain('CAD 5.00');expect(signal.evidenceIds.every(id=>id.includes(':campaign:'))).toBe(true);expect(result.score).toBe(100);
});

it('does not pass the delivery policy check when ad status fields are absent',()=>{
 const data=input();delete data.sources.ads.data![0].effective_status;const result=evaluateMonitor(data);expect(result.checks.find(c=>c.id==='ad-policy')!.state).toBe('unknown');expect(result.score).toBeNull();
});
