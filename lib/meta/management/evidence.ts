import {readMonitorRun} from '../../monitoring/store';
import {staleSnapshot} from '../../monitoring/presentation';
import {findingTarget,monitoringReferenceSchema,type MonitoringReference} from '../../monitoring/workflow';
import {ManagementError,type Operation} from './types';
import type {Evidence,MonitorSnapshot} from '../../monitoring/types';

export type ChangeEvidence={reference:MonitoringReference;accountId:string;entityId:string;kind:'campaign'|'ad';title:string;explanation:string;nextStep:string;window:MonitorSnapshot['window'];completedAt:string;skill:MonitorSnapshot['skill'];facts:Evidence[]};
export function bindChangeEvidence(snapshot:MonitorSnapshot|null,accountId:string,reference:MonitoringReference,operation:Operation,now=new Date()):ChangeEvidence {
  if(!snapshot||snapshot.account.id!==accountId||snapshot.period!==reference.period||snapshot.id!==reference.runId)throw new ManagementError('The source finding is unavailable for this account. Refresh the evidence and reopen the finding.');
  const finding=snapshot.findings.find(f=>f.id===reference.findingId),target=finding&&findingTarget(snapshot,finding);
  if(!finding||!target)throw new ManagementError('This finding needs an account source review rather than a campaign edit.');
  if(staleSnapshot(snapshot,now))throw new ManagementError('The source finding is from an earlier reporting day. Refresh monitoring and prepare the change from its current evidence.');
  const targets=operation.action==='update'?[{kind:operation.kind,id:operation.id}]:operation.action==='replace_creative'?[{kind:'ad',id:operation.id}]:operation.action==='status'?operation.targets:[];
  if(!targets.length||targets.some(t=>t.kind!==target.kind||t.id!==target.id))throw new ManagementError('The change does not match the entity in the source finding. Open the exact campaign or ad, or prepare a separate unlinked review.');
  const facts=snapshot.evidence.filter(f=>finding.evidenceIds.includes(f.id));
  if(facts.length!==new Set(finding.evidenceIds).size)throw new ManagementError('The finding has incomplete source references. Refresh its monitoring evidence.');
  return {reference,accountId,entityId:target.id,kind:target.kind,title:finding.title,explanation:finding.explanation,nextStep:finding.nextStep,window:snapshot.window,completedAt:snapshot.completedAt,skill:snapshot.skill,facts};
}
export async function resolveChangeEvidence(accountId:string,raw:unknown,operation:Operation) {
  const reference=monitoringReferenceSchema.parse(raw);
  return bindChangeEvidence(await readMonitorRun(accountId,reference.period,reference.runId),accountId,reference,operation);
}
