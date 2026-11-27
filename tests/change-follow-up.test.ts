import {expect,it} from 'vitest';
import {changeFollowUp} from '../lib/meta/management/follow-up';
import type {Draft} from '../lib/meta/management/types';
import {evaluateMonitor} from '../lib/monitoring/engine';
import {input} from './fixtures/monitoring';
function fixture(){
 const data=input(),snapshot=evaluateMonitor(data);
 const before={...snapshot.evidence.find(f=>f.id==='current:campaign:101:spend')!,window:{since:'2026-11-06',until:'2026-11-12'},value:'90'};
 const draft={accountId:snapshot.account.id,currency:snapshot.account.currency,state:'complete',updatedAt:'2026-11-12T20:00:00Z',steps:[{state:'verified'}],sourceEvidence:{reference:{period:'7d',runId:'baseline',findingId:'finding'},accountId:snapshot.account.id,entityId:'101',kind:'campaign',window:before.window,facts:[before]}} as Draft;
 return {snapshot,draft,before};
}
it('compares exact entity metrics only after a full later completed window, without inferring causation',()=>{
 const {snapshot,draft}=fixture();draft.updatedAt='2026-11-13T20:00:00Z';
 const result=changeFollowUp(draft,snapshot,new Date(snapshot.completedAt));
 expect(result.state).toBe('observed');expect(result.rows?.[0].before.value).toBe('90');expect(result.rows?.[0].after.value).toBe('100');
 expect(result.detail).toContain('does not prove');expect(result.runId).toBe(snapshot.id);
});
it('waits through the change day and rejects overlapping baseline, stale and unreconciled evidence',()=>{
 const {snapshot,draft}=fixture();draft.updatedAt='2026-11-20T12:00:00Z';
 expect(changeFollowUp(draft,snapshot,new Date(snapshot.completedAt)).state).toBe('waiting');
 snapshot.integrity='mismatch';expect(changeFollowUp(draft,snapshot,new Date(snapshot.completedAt)).state).toBe('unavailable');
 snapshot.integrity='verified';expect(changeFollowUp(draft,snapshot,new Date('2026-12-10T12:00:00Z')).state).toBe('unavailable');
});
it('withholds partial receipts, wrong accounts, changed metric formulas and omitted results',()=>{
 const {snapshot,draft}=fixture();draft.updatedAt='2026-11-13T12:00:00Z';
 draft.state='partial';expect(changeFollowUp(draft,snapshot,new Date(snapshot.completedAt)).state).toBe('not_applied');draft.state='complete';
 draft.sourceEvidence!.accountId='act_456';expect(changeFollowUp(draft,snapshot,new Date(snapshot.completedAt)).state).toBe('unavailable');draft.sourceEvidence!.accountId=draft.accountId;
 draft.sourceEvidence!.facts[0].formula='different denominator';expect(changeFollowUp(draft,snapshot,new Date(snapshot.completedAt)).state).toBe('unavailable');
 delete draft.sourceEvidence!.facts[0].formula;snapshot.evidence.find(f=>f.id==='current:campaign:101:spend')!.value=null;
 expect(changeFollowUp(draft,snapshot,new Date(snapshot.completedAt)).rows).toBeUndefined();
});
