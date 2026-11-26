import {activeClients} from '../../config/active-clients';
import {readClientContext} from '../reports/client-context';
import type {MetaAccount} from '../meta/read';
import {evaluateMonitor} from './engine';
import {collectMonitorSources} from './provider';
import {claimRefresh,latestMonitor,newMonitorId,readIssue,saveMonitor} from './store';
import type {MonitorSnapshot,MonitorSummary,Period,PortfolioEntry} from './types';

export function monitorSummary(snapshot:MonitorSnapshot):MonitorSummary {
  const {sources,...summary}=snapshot;void sources;
  // Keep portfolio responses bounded; the account endpoint retains the full ledger.
  const keep=new Set(snapshot.evidence.filter(f=>f.scope==='account').map(f=>f.id));
  for(const id of [...snapshot.checks.flatMap(c=>c.evidenceIds),...snapshot.findings.flatMap(f=>f.evidenceIds)])keep.add(id);
  let changed=true;
  while(changed){changed=false;for(const fact of snapshot.evidence)if(keep.has(fact.id))for(const id of fact.inputs||[])if(!keep.has(id)){keep.add(id);changed=true;}}
  return {...summary,evidence:snapshot.evidence.filter(f=>keep.has(f.id))};
}
export function assignedAccount(accounts:MetaAccount[],id:string) {
  if(!activeClients.some(client=>client.accountId===id))throw Error('Monitoring is limited to the assigned reporting portfolio.');
  const account=accounts.find(a=>a.id===id);if(!account)throw Error('This assigned account is unavailable to the current Meta connection.');return account;
}
export async function refreshAccount(account:MetaAccount,period:Period) {
  const release=await claimRefresh(account.id,period),startedAt=new Date().toISOString();
  try {
    const [{sources,window,previous},contextResult]=await Promise.all([collectMonitorSources(account,period),readClientContext(account.id).then(value=>({value,error:false})).catch(()=>({value:null,error:true}))]);
    const snapshot=evaluateMonitor({id:newMonitorId(),account,period,window,previous,sources,context:contextResult.value,contextError:contextResult.error,startedAt});
    await saveMonitor(snapshot);return snapshot;
  } finally {await release().catch(()=>undefined);}
}
export async function portfolioEntry(id:string,name:string,account:MetaAccount|null,period:Period):Promise<PortfolioEntry> {
  if(!account)return {id,name,account:null,snapshot:null,notes:{},error:'Assigned account unavailable to this connection.'};
  try {
    const snapshot=await latestMonitor(id,period);
    const notes:PortfolioEntry['notes']={};
    if(snapshot)for(let start=0;start<snapshot.findings.length;start+=12)await Promise.all(snapshot.findings.slice(start,start+12).map(async finding=>{notes[finding.id]=await readIssue(id,period,finding.id);}));
    return {id,name,account,snapshot:snapshot?monitorSummary(snapshot):null,notes};
  } catch {return {id,name,account,snapshot:null,notes:{},error:'Saved evidence or issue records could not be read. Retry loading this account.'};}
}
