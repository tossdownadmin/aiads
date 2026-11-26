import {expect,it} from 'vitest';
import {evaluateMonitor} from '../lib/monitoring/engine';
import {campaignReviewLink,findingTarget,monitoringReferenceSchema} from '../lib/monitoring/workflow';
import {bindChangeEvidence} from '../lib/meta/management/evidence';
import {input,now} from './fixtures/monitoring';
import type {Operation} from '../lib/meta/management/types';
function reviewed(){const d=input();for(const key of ['currentAccount','currentCampaigns','currentAds'] as const)d.sources[key].data![0].spend='200';return evaluateMonitor(d);}
const operation:Operation={action:'update',kind:'campaign',id:'101',fields:{name:'Reviewed name'}};
it('deep-links the exact affected campaign and preserves immutable source identity',()=>{
 const s=reviewed(),f=s.findings.find(f=>f.ruleId==='efficiency-trend')!,link=new URL(campaignReviewLink(s,f),'https://tool.test');
 expect(findingTarget(s,f)).toEqual({kind:'campaign',id:'101'});expect(link.searchParams.get('entity')).toBe('101');expect(link.searchParams.get('runId')).toBe(s.id);expect(link.searchParams.get('finding')).toBe(f.id);
 const reference={period:s.period,runId:s.id,findingId:f.id},proof=bindChangeEvidence(s,s.account.id,reference,operation,now);
 expect(proof.entityId).toBe('101');expect(proof.facts.some(f=>f.metric==='goalCost'&&f.value==='10')).toBe(true);expect(proof.window).toEqual(s.window);expect(proof.skill.hash).toBe(s.skill.hash);
});
it('rejects stale, mismatched-account, missing-finding, wrong-entity and bulk-unrelated references',()=>{
 const s=reviewed(),f=s.findings.find(f=>f.ruleId==='efficiency-trend')!,reference={period:s.period,runId:s.id,findingId:f.id};
 expect(()=>bindChangeEvidence(s,'act_999',reference,operation,now)).toThrow('account');
 expect(()=>bindChangeEvidence(s,s.account.id,{...reference,findingId:'missing'},operation,now)).toThrow('account source review');
 expect(()=>bindChangeEvidence(s,s.account.id,reference,{...operation,id:'102'},now)).toThrow('does not match');
 expect(()=>bindChangeEvidence(s,s.account.id,reference,{action:'status',targets:[{kind:'campaign',id:'101',status:'PAUSED'},{kind:'campaign',id:'102',status:'PAUSED'}]},now)).toThrow('does not match');
 expect(()=>bindChangeEvidence(s,s.account.id,reference,operation,new Date('2026-11-29T15:00:00Z'))).toThrow('earlier reporting day');
 expect(()=>monitoringReferenceSchema.parse({...reference,accountId:'act_999'})).toThrow();
});
it('does not turn account source coverage problems into entity edits or accept incomplete references',()=>{
 const d=input();d.sources.currentAccount.data=[];const s=evaluateMonitor(d),f=s.findings.find(f=>f.ruleId==='source-reconciliation')!;
 expect(findingTarget(s,f)).toBeNull();expect(()=>bindChangeEvidence(s,s.account.id,{period:s.period,runId:s.id,findingId:f.id},operation,now)).toThrow('account source review');
 const ready=reviewed(),signal=ready.findings.find(f=>f.ruleId==='efficiency-trend')!;ready.evidence=ready.evidence.filter(f=>f.id!==signal.evidenceIds[0]);expect(()=>bindChangeEvidence(ready,ready.account.id,{period:ready.period,runId:ready.id,findingId:signal.id},operation,now)).toThrow('incomplete');
});
