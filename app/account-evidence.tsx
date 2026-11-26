'use client';
import {useEffect,useRef,useState} from 'react';
import {activeClients} from '../config/active-clients';
import {accountFact,evidenceValue,staleSnapshot} from '../lib/monitoring/presentation';
import {campaignReviewLink,findingTarget} from '../lib/monitoring/workflow';
import type {Finding,MonitorSummary,Period} from '../lib/monitoring/types';
import './account-evidence.css';

export function useAccountEvidence(accountId:string,period:Period,runId?:string) {
  const [snapshot,setSnapshot]=useState<MonitorSummary|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[refreshing,setRefreshing]=useState(false),[revision,setRevision]=useState(0);
  const generation=useRef(0),assigned=activeClients.some(c=>c.accountId===accountId);
  useEffect(()=>{
    const current=++generation.current,controller=new AbortController();setSnapshot(null);setError('');setRefreshing(false);
    if(!accountId||!assigned){setLoading(false);return;}
    setLoading(true);
    void fetch('/api/monitoring?view=summary&accountId='+accountId+'&period='+period+(runId?'&runId='+encodeURIComponent(runId):''),{cache:'no-store',signal:controller.signal}).then(async response=>{
      const data=await response.json();if(!response.ok)throw Error(response.status===404?'No saved evidence for these dates yet. Refresh this account to read Meta.':data.error||'Account evidence could not be loaded.');
      if(data.snapshot?.account.id!==accountId||data.snapshot.period!==period)throw Error('Source evidence did not match the selected account and period.');
      if(generation.current===current)setSnapshot(data.snapshot);
    }).catch(e=>{if(!controller.signal.aborted&&generation.current===current)setError(e.message);}).finally(()=>{if(generation.current===current)setLoading(false);});
    return()=>{controller.abort();generation.current++;};
  },[accountId,period,runId,revision,assigned]);
  async function refresh(){if(!assigned||refreshing)return;const current=++generation.current;setRefreshing(true);setLoading(false);setError('');try{
    const response=await fetch('/api/monitoring',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accountId,period})}),data=await response.json();if(!response.ok)throw Error(data.error||'The source refresh did not finish.');
    if(data.snapshot?.account.id!==accountId||data.snapshot.period!==period)throw Error('Refreshed evidence did not match this account.');
    if(generation.current===current)setSnapshot(data.snapshot);
  }catch(e){if(generation.current===current)setError((e as Error).message);}finally{if(generation.current===current)setRefreshing(false);}}
  return {snapshot,loading,error,refreshing,assigned,refresh,reload:()=>setRevision(r=>r+1)};
}
export type AccountEvidenceState=ReturnType<typeof useAccountEvidence>;
export default function AccountEvidence({state,onInspect}:{state:AccountEvidenceState;onInspect?:(finding:Finding,snapshot:MonitorSummary)=>void}) {
  const {snapshot:s,loading,error,refreshing,assigned}=state;
  return <section className="ae-workspace" aria-label="Account performance and recommendations"><header><div><h2>Performance &amp; next actions</h2><p>Reported outcomes follow each campaign’s Meta settings. Current delivery configuration is shown separately.</p></div>{assigned&&<button type="button" disabled={loading||refreshing} onClick={()=>void state.refresh()}>{refreshing?'Reading Meta…':'Refresh account evidence'}</button>}</header>
    {!assigned?<p>Daily monitoring is enabled for the 15 assigned accounts. Current settings remain available for other connected accounts.</p>:<>{loading&&<p role="status">Loading saved campaign evidence…</p>}{error&&<p role="alert">{error} <button type="button" onClick={state.reload}>Retry saved evidence</button></p>}{s&&<>
      <div className="ae-source"><span>{s.window.since} – {s.window.until} · {s.account.timezone}</span><span>Read {new Date(s.completedAt).toLocaleString()}</span><span>Method {s.skill.name} · v{s.skill.version}</span>{staleSnapshot(s)&&<strong>Earlier source snapshot · refresh before a change</strong>}<a href={'/api/monitoring?accountId='+s.account.id+'&period='+s.period+'&runId='+s.id} target="_blank" rel="noreferrer">Source ledger ↗</a></div>
      <div className="ae-metrics"><article><span>Account spend</span><strong>{evidenceValue(accountFact(s,'spend'))}</strong><small>{s.integrity==='verified'?'Account / campaign spend reconciled':'Source reconciliation '+s.integrity}</small></article><article><span>Meta Opportunity Score</span><strong>{s.nativeScore??'—'}</strong><small>Meta native · / 100</small></article><article><span>Source &amp; delivery</span><strong>{s.scoreBasis==='source-and-delivery'?s.score??'—':'Refresh'}</strong><small>Operational checks only · not a performance grade</small></article><article><span>Campaign outcome coverage</span><strong>{s.campaignOutcomes?.filter(c=>c.state==='reported').length??'—'} / {s.campaignOutcomes?.length??'—'}</strong><small>Exact named results returned</small></article></div>
      <h3>Review next</h3>{s.findings.length?s.findings.map(f=>{const target=findingTarget(s,f);return <article className="ae-finding" key={f.id}><div><small>{f.priority} · {f.category} · {f.entityName}</small><h4>{f.title}</h4><p>{f.explanation}</p><p><strong>Next step:</strong> {f.nextStep}</p></div><div>{target?(onInspect?<button type="button" onClick={()=>onInspect(f,s)}>Inspect {target.kind}</button>:<a href={campaignReviewLink(s,f)}>Inspect {target.kind} →</a>):<a href={'/?account='+s.account.id}>Review account sources →</a>}<details><summary>Evidence</summary><ul>{s.evidence.filter(e=>f.evidenceIds.includes(e.id)).map(e=><li key={e.id}>{e.label}: <strong>{evidenceValue(e)}</strong><small>{e.entityName} · {e.window?.since} – {e.window?.until} · {e.id}</small></li>)}</ul></details></div></article>;}):<p>No review condition was detected by this method. Check source coverage before interpreting this as a performance assessment.</p>}
      <h3>Campaign outcomes</h3><div className="ae-table"><table><thead><tr><th>Campaign / current goal</th><th>Spend</th><th>Named outcome</th><th>Matching result cost</th></tr></thead><tbody>{s.campaignOutcomes?.map(c=>{const fact=(id?:string)=>s.evidence.find(e=>e.id===id);return <tr key={c.id}><td><a href={'/campaigns?account='+s.account.id+'&kind=campaign&entity='+c.id+'&period='+s.period}>{c.name}</a><small>{c.objective} · {c.goals.join(' / ')}{c.events.length?' · '+c.events.join(' / '):''}</small></td><td>{evidenceValue(fact(c.spendId))}</td><td>{evidenceValue(fact(c.resultId))}<small>{c.label}</small></td><td>{evidenceValue(fact(c.costId))}<small>{fact(c.costId)?.label||c.detail}</small></td></tr>;})}</tbody></table></div>{!s.campaignOutcomes?.length&&<p>No spending campaign with a supported source read is available for these dates.</p>}<p className="ae-caption">Current settings do not prove historical configuration. Missing actions are unavailable, never assumed zero. Platform-reported purchases and leads do not establish profit or lead qualification.</p>
    </>}</>}
  </section>;
}
