import {z} from 'zod';
import type {Finding,MonitorSummary} from './types';

export const monitoringReferenceSchema=z.object({period:z.enum(['7d','30d']),runId:z.string().regex(/^\d{13}-[a-f\d-]{36}$/),findingId:z.string().min(1).max(240)}).strict();
export type MonitoringReference= z.infer<typeof monitoringReferenceSchema>;
export function findingTarget(snapshot:MonitorSummary,finding:Finding):{kind:'campaign'|'ad';id:string}|null {
  if(finding.entityId===snapshot.account.id)return null;
  if(snapshot.campaignOutcomes?.some(c=>c.id===finding.entityId))return {kind:'campaign',id:finding.entityId};
  if(['ad-policy','creative-engagement'].includes(finding.ruleId))return {kind:'ad',id:finding.entityId};
  return null;
}
export function campaignReviewLink(snapshot:MonitorSummary,finding:Finding) {
  const params=new URLSearchParams({account:snapshot.account.id,period:snapshot.period,runId:snapshot.id,finding:finding.id});
  const target=findingTarget(snapshot,finding);if(target){params.set('kind',target.kind);params.set('entity',target.id);}
  return '/campaigns?'+params;
}
