import {accountToday} from '../../reports/model';
import {staleSnapshot} from '../../monitoring/presentation';
import type {Evidence,MonitorSnapshot} from '../../monitoring/types';
import type {Draft} from './types';

export type ChangeFollowUp={state:'unlinked'|'not_applied'|'unavailable'|'waiting'|'observed';detail:string;dueAfter?:string;runId?:string;period?:'7d'|'30d';window?:MonitorSnapshot['window'];baselineWindow?:MonitorSnapshot['window'];rows?:{label:string;before:Evidence;after:Evidence}[]};
/** A dated observation, never a causal verdict or automatic advertising action. */
export function changeFollowUp(draft:Draft,snapshot:MonitorSnapshot|null,now=new Date()):ChangeFollowUp {
  const source=draft.sourceEvidence;
  if(!source)return {state:'unlinked',detail:'No monitoring finding was attached to this change. Review current performance from Performance & actions.'};
  if(draft.state!=='complete'||!draft.updatedAt||!draft.steps.length||draft.steps.some(step=>step.state!=='verified'))return {state:'not_applied',detail:'A complete verified execution receipt is required before measuring follow-up.'};
  if(!snapshot||snapshot.account.id!==draft.accountId||snapshot.account.currency!==draft.currency||snapshot.period!==source.reference.period||source.accountId!==draft.accountId||snapshot.integrity!=='verified'||staleSnapshot(snapshot,now))return {state:'unavailable',detail:'Refresh matching account monitoring to load current, reconciled evidence for this follow-up.'};
  const applied=new Date(draft.updatedAt);
  if(!Number.isFinite(applied.getTime()))return {state:'unavailable',detail:'The execution timestamp is unavailable.'};
  const changeDay=accountToday(snapshot.account.timezone,applied);
  const days=(Date.parse(source.window.until)-Date.parse(source.window.since))/86400000+1;
  if(days!==(snapshot.period==='7d'?7:30))return {state:'unavailable',detail:'The baseline reporting length does not match this follow-up.'};
  const due=new Date(changeDay+'T00:00:00Z');due.setUTCDate(due.getUTCDate()+days+1);
  const base={runId:snapshot.id,period:snapshot.period,window:snapshot.window,baselineWindow:source.window,dueAfter:due.toISOString().slice(0,10)};
  // Exclude the whole change day, so neither comparison window straddles the write.
  if(source.window.until>=changeDay||snapshot.window.since<=changeDay)return {...base,state:'waiting',detail:'Waiting for a full '+days+' completed days after the change day. Refresh on or after '+base.dueAfter+' in the account timezone.'};
  const rows=source.facts.filter(f=>f.entityId===source.entityId&&f.scope===source.kind&&f.window?.since===source.window.since&&f.window.until===source.window.until&&f.value!==null&&f.unit!=='status').flatMap(before=>{
    const after=snapshot.evidence.find(f=>f.entityId===before.entityId&&f.scope===before.scope&&f.metric===before.metric&&f.label===before.label&&f.unit===before.unit&&f.currency===before.currency&&f.window?.since===snapshot.window.since&&f.window.until===snapshot.window.until&&f.value!==null);
    // A changed configured result changes goalCost's denominator; do not compare it.
    if(!after||before.formula!==after.formula||(!before.formula&&before.field!==after.field))return [];
    return [{label:before.label,before,after}];
  });
  if(!rows.length)return {...base,state:'unavailable',detail:'No matching named metrics were returned for this entity and full later window. Missing values are not zero.'};
  return {...base,state:'observed',rows,detail:'Same-entity source observations for equal reporting lengths. Other edits, audiences, attribution and seasonality can affect results; this does not prove the change caused an improvement.'};
}
