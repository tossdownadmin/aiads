import {accountToday,shiftDay} from '../reports/model';
import {formatDecimal,formatMoney,sum} from './decimal';
import type {Evidence,IssueNote,MonitorSummary,PortfolioEntry,WorkflowState} from './types';
export function accountFact(snapshot:MonitorSummary,metric:string,period='current') {return snapshot.evidence.find(f=>f.id===`${period}:account:${snapshot.account.id}:${metric}`);}
export function evidenceValue(fact:Evidence|undefined) {if(!fact)return '—';return fact.unit==='currency'?formatMoney(fact.value,fact.currency!):formatDecimal(fact.value,fact.unit==='percent'||fact.unit==='ratio'?2:undefined)+(fact.value!==null?(fact.unit==='percent'?'%':fact.unit==='ratio'&&fact.metric==='roas'?'×':''):'');}
export function staleSnapshot(snapshot:MonitorSummary,now=new Date()) {return Date.parse(snapshot.completedAt)<now.getTime()-26*3600000||snapshot.window.until!==shiftDay(accountToday(snapshot.account.timezone,now),-1);}
export function issueState(note:IssueNote|null|undefined,now=new Date()):WorkflowState {return note?.state==='snoozed'&&(!note.snoozedUntil||Date.parse(note.snoozedUntil)<=now.getTime())?'open':note?.state||'open';}
export function spendGroups(entries:PortfolioEntry[],now=new Date()) {
  const groups=new Map<string,{currency:string;since:string;until:string;accountIds:string[];values:string[]}>();
  for(const row of entries){const s=row.snapshot,f=s&&accountFact(s,'spend');if(!s||s.integrity!=='verified'||staleSnapshot(s,now)||f?.value==null)continue;
    const key=[s.account.currency,s.window.since,s.window.until].join(':'),group=groups.get(key)||{currency:s.account.currency,since:s.window.since,until:s.window.until,accountIds:[],values:[]};group.values.push(f.value);group.accountIds.push(row.id);groups.set(key,group);}
  return [...groups.values()].map(({values,...group})=>({...group,total:sum(values)}));
}
export function evidenceCsv(snapshot:MonitorSummary) {
  const quote=(value:unknown)=>'"'+String(value??'').replace(/^[=+\-@\t\r]/,"'$&").replaceAll('"','""')+'"';
  const rows=[['Evidence ID','Metric','Raw value','Display value','Unit','Currency','Scope','Entity ID','Entity name','Since','Until','Source','Source field','Formula','Input IDs','Retrieved at','Skill version','Skill hash'],...snapshot.evidence.map(f=>[f.id,f.metric,f.value,evidenceValue(f),f.unit,f.currency||'',f.scope,f.entityId,f.entityName,f.window?.since||'',f.window?.until||'',f.source,f.field,f.formula||'',f.inputs?.join(' | ')||'',f.retrievedAt,snapshot.skill.version,snapshot.skill.hash])];
  return '\ufeff'+rows.map(row=>row.map(quote).join(',')).join('\r\n');
}
