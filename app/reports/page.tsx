'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { signIn } from 'next-auth/react';
import WorkspaceShell from '../workspace-shell';
import { clientCatalog } from '../../lib/competitors/catalog';
import type { MetaAccount } from '../../lib/meta/read';
import { accountToday, shiftDay, type PlanInputs } from '../../lib/reports/model';
import ReportView, { type Entry, type Run } from './report-view';
import { importDailyTemplate, matchPortfolio, readStoredTemplate, templateKey, type DailyTemplate } from '../../lib/reports/daily-template';
import { renderDailyDocument } from '../../lib/reports/daily-document';
import './reports.css';

const emptyInputs: PlanInputs = { brief: '', competitors: '', event: '' };
export default function Reports() {
  const [mode,setMode] = useState<'daily'|'plan'>('daily');
  const [accounts,setAccounts] = useState<MetaAccount[]>([]);
  const [denied,setDenied] = useState(false);
  const [loaded,setLoaded] = useState(false);
  const [error,setError] = useState('');
  const [query,setQuery] = useState('');
  const [selected,setSelected] = useState<string[]>([]);
  const [monthlyId,setMonthlyId] = useState('');
  const [researchClient,setResearchClient] = useState('');
  const [end,setEnd] = useState('');
  const [month,setMonth] = useState('');
  const [inputs,setInputs] = useState<PlanInputs>(emptyInputs);
  const [busy,setBusy] = useState(false);
  const [progress,setProgress] = useState('');
  const [run,setRun] = useState<Run|null>(null);
  const paper = useRef<HTMLDivElement>(null);
  const locked = useRef(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const [template,setTemplate] = useState<DailyTemplate>();
  const [templateNote,setTemplateNote] = useState('');
  const [templateText,setTemplateText] = useState('');
  const portfolio = useMemo(()=>matchPortfolio(template,accounts),[template,accounts]);
  const dailyHtml = useMemo(()=>run?.mode==='daily' ? renderDailyDocument(run.entries,run.date,run.presentation) : '',[run]);
  const [dailyUrl,setDailyUrl] = useState('');
  useEffect(()=>{
    if (!dailyHtml) { setDailyUrl(''); return; }
    const url=URL.createObjectURL(new Blob([dailyHtml],{type:'text/html;charset=utf-8'}));
    setDailyUrl(url); return ()=>URL.revokeObjectURL(url);
  },[dailyHtml]);
  function useTemplate(value:DailyTemplate,list:MetaAccount[]) {
    setTemplate(value);
    const ids=Array.from(matchPortfolio(value,list).matches).filter(([,client])=>client.periods).map(([id])=>id);
    setSelected(ids); setRun(null);
  }
  function applyTemplateText(source:string) {
    try {
      const value=importDailyTemplate(source);
      useTemplate(value,accounts);
      setTemplateText('');
      try { localStorage.setItem(templateKey,JSON.stringify(value)); setTemplateNote('Template saved in this browser.'); }
      catch { setTemplateNote('Template is available for this session.'); }
    } catch(e) { setTemplateNote(e instanceof Error?e.message:'The template could not be read.'); }
  }
  async function loadTemplate(file?:File) {
    if (!file) return;
    if (file.size>3_000_000) {setTemplateNote('Choose the original daily HTML report, under 3 MB.');return;}
    try {applyTemplateText(await file.text());} catch {setTemplateNote('This file could not be read.');}
  }
  async function connect() {
    setError(''); setLoaded(false);
    try {
      const r = await fetch('/api/meta/accounts', { cache: 'no-store' });
      if (r.status === 401) { setDenied(true); return; }
      if (!r.ok) throw new Error();
      const {accounts: list} = await r.json() as {accounts: MetaAccount[]};
      setAccounts(list.sort((a,b) => a.name.localeCompare(b.name)));
      try { const saved=readStoredTemplate(localStorage.getItem(templateKey)); if(saved) useTemplate(saved,list); } catch { /* Browser storage can be unavailable. */ }
      const today = accountToday(Intl.DateTimeFormat().resolvedOptions().timeZone);
      setEnd(shiftDay(today,-1));
      const next = new Date(today.slice(0,7) + '-01T00:00:00Z');
      next.setUTCMonth(next.getUTCMonth() + 1);
      setMonth(next.toISOString().slice(0,7));
      setLoaded(true);
    } catch { setError('The account list could not be read.'); }
  }
  useEffect(() => { void connect(); },[]);
  const chosen = accounts.filter(a => mode === 'daily' ? selected.includes(a.id) : a.id === monthlyId);
  const matches = accounts.filter(a => (a.name + a.currency + a.id).toLowerCase().includes(query.toLowerCase().trim()));
  async function generate(form: HTMLFormElement) {
    if (locked.current || !chosen.length) return;
    locked.current = true; setBusy(true); setError(''); setRun(null);
    let cursor = 0, done = 0;
    const entries: Entry[] = [];
    const data = new FormData(form);
    const date = String(data.get(mode === 'daily' ? 'end' : 'month') || '');
    const worker = async () => {
      while (cursor < chosen.length) {
        const index = cursor++, account = chosen[index];
        try {
          const body = mode === 'daily' ? { mode, accountId: account.id, end:date } : { mode, accountId: account.id, month:date, inputs, researchClient:researchClient || undefined };
          const response = await fetch('/api/meta/reports', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Report unavailable');
          entries[index] = { account, report: data.report, plan: data.plan, planError: data.planError };
        } catch (cause) { entries[index] = { account, error: cause instanceof Error ? cause.message : 'Account unavailable.' }; }
        done++; setProgress(done + ' of ' + chosen.length + ' accounts read');
      }
    };
    setProgress('Reading ' + chosen.length + ' account' + (chosen.length === 1 ? '' : 's') + '…');
    try {
      await Promise.all(Array.from({length:Math.min(2,chosen.length)}, worker));
      const layouts=Object.fromEntries(portfolio.matches);
      const exclusions=[...portfolio.missing,...Array.from(portfolio.matches).filter(([id])=>!selected.includes(id)).map(([,c])=>({name:c.name,reason:'Available in Meta. Outside the selected accounts for this report.'}))];
      if (mode==='daily' && template) {
        const order=new Map(Array.from(portfolio.matches.keys(),(id,i)=>[id,i]));
        entries.sort((a,b)=>(order.get(a.account.id)??Infinity)-(order.get(b.account.id)??Infinity));
      }
      setRun({mode,date,inputs:{...inputs},entries,presentation:mode==='daily'?{layouts,exclusions,template}:undefined});
    } finally { locked.current=false; setBusy(false); }
  }
  function download() {
    const content = paper.current?.querySelector('article')?.cloneNode(true) as HTMLElement | undefined;
    if (!content || !run) return;
    const doc = document.implementation.createHTMLDocument('Tossdown · ' + (run.mode === 'daily' ? 'Daily account report' : 'Next-month ad plan'));
    const meta = doc.createElement('meta'); meta.setAttribute('charset','utf-8'); doc.head.prepend(meta);
    const viewport = doc.createElement('meta'); viewport.name='viewport'; viewport.content='width=device-width, initial-scale=1'; doc.head.append(viewport);
    const style = doc.createElement('style');
    const rules: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      try { for (const rule of Array.from(sheet.cssRules)) if (/report-paper|rep-|window-week|window-month/.test(rule.cssText)) rules.push(rule.cssText); } catch { /* skip unrelated cross-origin styles */ }
    }
    style.textContent = 'body{margin:20px auto;max-width:1250px;padding:8px;font:15px system-ui,sans-serif;color:#173b33}*{box-sizing:border-box}' + rules.join('\n');
    doc.head.append(style); doc.body.append(content);
    const file = new Blob(['<!doctype html>\n',doc.documentElement.outerHTML],{type:'text/html;charset=utf-8'});
    const url = URL.createObjectURL(file), link=document.createElement('a');
    link.href=url;link.download='tossdown-' + run.mode + '-' + run.date + '.html';link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  return <WorkspaceShell active="reports" status={loaded ? 'Connected' : undefined}><div className="rep-workspace">
    <header><h1>Client reports</h1><p>Review account delivery or prepare a monthly campaign plan.</p></header>
    {!loaded ? <section className="workspace-card"><p>{denied ? 'Use your approved Google account to open reports.' : error || 'Loading Meta accounts…'}</p>{denied ? <button onClick={() => void signIn('google',{callbackUrl:'/reports'})}>Sign in with Google</button> : error && <button onClick={() => void connect()}>Retry</button>}</section> :
    <form className="workspace-card rep-form" onSubmit={e => { e.preventDefault(); void generate(e.currentTarget); }}><fieldset disabled={busy}><legend>Report setup</legend>
      <div className="rep-mode">{(['daily','plan'] as const).map(m => <button key={m} type="button" aria-pressed={mode===m} onClick={() => {setMode(m);setQuery('');setRun(null);}}>{m==='daily' ? 'Daily account report' : 'Next-month ad plan'}</button>)}</div>
      {mode === 'daily' ? <>
        <div className="rep-inputs"><label>Through date<input type="date" name="end" defaultValue={end} required onInput={e=>setEnd(e.currentTarget.value)}/></label><label>Find ad accounts<input type="search" value={query} placeholder="Name or account ID" onChange={e=>setQuery(e.target.value)}/></label></div>
        <div className="rep-template"><div><strong>{template?'Daily report template':'Use a previous daily report'}</strong><small>{template?template.clients.length+' expected brands · '+portfolio.matches.size+' matched accounts':'Choose the original daily HTML to use its client list and KPI cards. Figures are read from Meta for the selected dates.'}</small></div><label className="rep-file">{template?'Replace template':'Open template'}<input type="file" accept=".html,.htm,text/html" aria-label="Open daily HTML template" onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';void loadTemplate(file);}}/></label>{template && <button type="button" onClick={()=>useTemplate(template,accounts)}>Select template accounts</button>}<small role="status">{templateNote}</small></div>
        <details className="rep-paste-template"><summary>Paste a template</summary><label>Daily report HTML or template settings<textarea rows={3} value={templateText} maxLength={3_000_000} onChange={e=>setTemplateText(e.target.value)} /></label><button type="button" disabled={!templateText.trim()} onClick={()=>applyTemplateText(templateText)}>Apply template</button></details>
        <div className="rep-selectbar"><strong>{selected.length} selected</strong><button type="button" onClick={()=>setSelected([...new Set([...selected,...matches.map(a=>a.id)])])}>Select {query ? 'matches' : 'all'}</button><button type="button" onClick={()=>setSelected([])}>Clear</button></div>
        <div className="rep-accounts">{matches.map(a=><label key={a.id}><input type="checkbox" checked={selected.includes(a.id)} onChange={e=>setSelected(e.target.checked?[...selected,a.id]:selected.filter(id=>id!==a.id))}/><span>{a.name}<small>{a.currency} · {a.id}</small></span></label>)}{!matches.length && <p>No matching account</p>}</div></> :
      <><div className="rep-inputs"><label>Ad account<select required value={monthlyId} onChange={e=>{setMonthlyId(e.target.value);setResearchClient('');setInputs(emptyInputs);setRun(null);}}><option value="">Choose account</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.currency} · {a.id}</option>)}</select></label><label>Plan month<input type="month" name="month" required defaultValue={month} onInput={e=>{setMonth(e.currentTarget.value);setInputs(emptyInputs);setRun(null);}}/></label></div>
      <div className="rep-inputs"><label>Approved plan month cap {chosen[0]?.currency}<input type="number" min="0.01" max="100000000000" step="any" placeholder="Optional" value={inputs.cap ?? ''} onChange={e=>setInputs({...inputs,cap:e.target.value ? Number(e.target.value) : undefined})}/></label><label>Previous month cap {chosen[0]?.currency}<input type="number" min="0.01" max="100000000000" step="any" placeholder="Optional" value={inputs.previousCap ?? ''} onChange={e=>setInputs({...inputs,previousCap:e.target.value ? Number(e.target.value) : undefined})}/></label></div>
      <label>Fetch current competitor ads from Foreplay<select value={researchClient} onChange={e=>setResearchClient(e.target.value)}><option value="">Skip paid lookup</option>{clientCatalog.map(c=><option key={c.id} value={c.id}>{c.name} · reviewed advertisers</option>)}</select><small>Uses the selected research client’s saved matches. Up to 20 ads at one credit per returned ad.</small></label>
      <label>Client brief<textarea value={inputs.brief} maxLength={4000} placeholder="Goals, market, approved offers and brand voice" onChange={e=>setInputs({...inputs,brief:e.target.value})}/></label>
      <div className="rep-inputs"><label>Competitor evidence<textarea maxLength={4000} value={inputs.competitors} placeholder="Observed ad, source link and date" onChange={e=>setInputs({...inputs,competitors:e.target.value})}/><a href="/competitors" target="_blank" rel="noreferrer">Open competitor research ↗</a></label>
      <label>Market event<textarea maxLength={2000} value={inputs.event} placeholder="Event, date, market and source" onChange={e=>setInputs({...inputs,event:e.target.value})}/></label></div></>}
      <button className="rep-primary" disabled={!chosen.length || busy} type="submit">{busy ? 'Preparing report…' : mode==='daily' ? 'Read selected accounts' : 'Draft monthly plan'}</button>
      <span role="status">{busy ? progress : ''}</span></fieldset></form>}
    {run?.mode==='daily' && dailyHtml && <section className="rep-daily-preview"><div className="rep-exports">{dailyUrl && <><a href={dailyUrl} target="_blank" rel="noopener noreferrer">Open full report ↗</a><a href={dailyUrl} download={'tossdown-daily-'+run.date+'.html'}>Download HTML</a></>}<button onClick={()=>frame.current?.contentWindow?.postMessage('print-daily-report','*')}>Print / save PDF</button></div><iframe ref={frame} title="Meta Ads daily report" sandbox="allow-scripts allow-modals" srcDoc={dailyHtml}/></section>}
    {run?.mode==='plan' && <section ref={paper}><div className="rep-exports"><button onClick={download}>Download HTML</button><button onClick={()=>window.print()}>Print / save PDF</button></div><ReportView run={run}/></section>}
    </div></WorkspaceShell>;
}
