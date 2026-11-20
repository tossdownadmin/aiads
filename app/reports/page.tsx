'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { signIn } from 'next-auth/react';
import WorkspaceShell from '../workspace-shell';
import { clientCatalog, type ClientSeed } from '../../lib/competitors/catalog';
import type { MetaAccount } from '../../lib/meta/read';
import { accountToday, shiftDay, type PlanInputs } from '../../lib/reports/model';
import ReportView, { type Run } from './report-view';
import { importDailyTemplate, matchPortfolio, templateKey, type DailyTemplate } from '../../lib/reports/daily-template';
import type {PublicDailyJob} from '../../lib/reports/daily-jobs';
import type { SavedDaily } from '../../lib/reports/saved-daily';
import './reports.css';
import { activeClients, activePortfolio, activePortfolioId, activeReportTemplate } from '../../config/active-clients';
import { dailyStyles } from '../../lib/reports/daily-style';
import { detailStyles } from '../../lib/reports/detail-view';
import { portableFontStyles } from '../../lib/ui/report-font';

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
  const [researchClients,setResearchClients] = useState<ClientSeed[]>(clientCatalog);
  const [researchClient,setResearchClient] = useState('');
  const [end,setEnd] = useState('');
  const [month,setMonth] = useState('');
  const [inputs,setInputs] = useState<PlanInputs>(emptyInputs);
  const [busy,setBusy] = useState(false);
  const [run,setRun] = useState<Run|null>(null);
  const paper = useRef<HTMLDivElement>(null);
  const locked = useRef(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const [template,setTemplate] = useState<DailyTemplate>();
  const [templateNote,setTemplateNote] = useState('');
  const [templateText,setTemplateText] = useState('');
  const portfolio = useMemo(()=>matchPortfolio(template,accounts),[template,accounts]);
  const assigned = useMemo(()=>activePortfolio(accounts),[accounts]);
  const [saved,setSaved]=useState<SavedDaily|null>(null);
  const [version,setVersion]=useState<string|null>(null);
  const [dailyReady,setDailyReady]=useState(false);
  const [dailyError,setDailyError]=useState('');
  const [skillError,setSkillError]=useState('');
  const [editing,setEditing]=useState(false);
  const [job,setJob]=useState<PublicDailyJob|null>(null);
  const [reportSkills,setReportSkills]=useState<Array<{name:string;description:string;sha:string;reportType:'daily'|'monthly'}>>([]);
  const [dailySkill,setDailySkill]=useState('daily-meta-review'),[monthlySkill,setMonthlySkill]=useState('monthly-meta-plan');
  const live=useRef(true);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  const dailyHtml=useMemo(()=>{
    const html=saved?.html;
    if(!html)return '';
    // Apply the current reading order to saved snapshots and their downloads.
    const doc=new DOMParser().parseFromString(html,'text/html');
    let changed=false;
    for(const panel of Array.from(doc.querySelectorAll('.tab-panel[data-panel]'))) {
      const gallery=Array.from(panel.children).find(el=>el.classList.contains('cg-campaigns'));
      const heading=gallery?.previousElementSibling;
      if(!gallery||gallery===panel.lastElementChild||!heading?.classList.contains('section-label')||!heading.textContent?.startsWith('Campaign Performance'))continue;
      panel.append(heading,gallery);changed=true;
    }
    const theme=doc.createElement('style');
    theme.setAttribute('data-tossdown-brand','rose-poppins-v1');
    theme.textContent=dailyStyles+detailStyles;
    doc.head.append(theme);changed=true;
    return changed?'<!doctype html>\n'+doc.documentElement.outerHTML:html;
  },[saved?.html]);
  async function openDaily() {
    setDailyError('');
    try {
      const r=await fetch('/api/meta/reports/daily',{cache:'no-store'});
      if (r.status===401) {setDenied(true);return;}
      if (!r.ok) throw new Error();
      const result=await r.json();
      setSaved(result.saved);setVersion(result.version);setJob(result.job);setDailyReady(true);if(result.saved?.skill?.name)setDailySkill(result.saved.skill.name);
    } catch {setDailyReady(false);setDailyError('The saved report could not be opened.');}
  }
  useEffect(()=>{
    if (!loaded) return;
    const custom=saved?.portfolioId==='custom';
    setSelected(custom?saved.accountIds:assigned.accountIds);
    setTemplate(custom?saved.template:activeReportTemplate(saved?.template));
  },[saved,loaded]);
  async function continueDaily(jobId:string) {
    while(live.current) {
      const response=await fetch('/api/meta/reports/daily',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'advance',jobId})});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||'The skill-based report update failed.');
      if(!live.current)return;
      setJob(result.job);
      if(result.saved){setSaved(result.saved);setVersion(result.version);setEditing(false);return;}
      if(result.job?.status==='failed')throw Error(result.job.error||'The skill analysis failed. Resume to retry.');
      if(result.processing)await new Promise(resolve=>setTimeout(resolve,5000));
    }
  }
  async function saveDaily(refresh:boolean) {
    if(locked.current||!dailyReady)return;
    locked.current=true;setBusy(true);setDailyError('');
    try {
      const response=await fetch('/api/meta/reports/daily',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'start',skillName:dailySkill,skillSha:reportSkills.find(s=>s.name===dailySkill)?.sha,...(refresh?{version}:{version,date:end,accountIds:selected,template})})});
      const result=await response.json();if(!response.ok){if(result.error?.includes('skill version'))void loadReportingSkills();throw Error(result.error||'Could not start the update.');}
      setJob(result.job);await continueDaily(result.job.id);
    }catch(e){setDailyError(e instanceof Error?e.message:'Could not update the report.');}
    finally{locked.current=false;if(live.current)setBusy(false);}
  }
  async function resumeDaily() {
    if(!job||locked.current)return;locked.current=true;setBusy(true);setDailyError('');
    try{await continueDaily(job.id);}catch(e){setDailyError(e instanceof Error?e.message:'Could not resume.');}
    finally{locked.current=false;if(live.current)setBusy(false);}
  }
  async function discardPending() {
    if(!job||busy)return;
    try{const response=await fetch('/api/meta/reports/daily',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'discard',jobId:job.id})});const result=await response.json();if(!response.ok)throw Error(result.error);setJob(result.job);setDailyError('');}
    catch(e){setDailyError(e instanceof Error?e.message:'Could not discard this update.');}
  }
  const [dailyUrl,setDailyUrl] = useState('');
  const [monthlyUrl,setMonthlyUrl]=useState('');
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
      // Restore account selection only from the shared saved report; applying a template is explicit.
      const today = accountToday(Intl.DateTimeFormat().resolvedOptions().timeZone);
      setEnd(shiftDay(today,-1));
      const next = new Date(today.slice(0,7) + '-01T00:00:00Z');
      next.setUTCMonth(next.getUTCMonth() + 1);
      setMonth(next.toISOString().slice(0,7));
      setLoaded(true);
    } catch { setError('The account list could not be read.'); }
  }
  async function loadReportingSkills() {
    setSkillError('');
    try {const response=await fetch('/api/skills/approved',{cache:'no-store'}),data=await response.json();if(!response.ok)throw Error('Reporting skills could not be loaded.');setReportSkills((data.skills||[]).filter((s:{reportType?:string})=>s.reportType==='daily'||s.reportType==='monthly'));}
    catch(e){setSkillError(e instanceof Error?e.message:'Reporting skills could not be loaded.');}
  }
  useEffect(() => {
    if(new URLSearchParams(window.location.search).get('view')==='monthly') setMode('plan');
    void connect();void openDaily();
    void loadReportingSkills();
    void fetch('/api/competitors/clients',{cache:'no-store'}).then(async response=>{if(response.ok)setResearchClients((await response.json()).clients);}).catch(()=>{});
  },[]);
  const chosen = accounts.filter(a => mode === 'daily' ? selected.includes(a.id) : a.id === monthlyId);
  const matches = accounts.filter(a => (a.name + a.currency + a.id).toLowerCase().includes(query.toLowerCase().trim()));
  async function generate(form: HTMLFormElement) {
    if(mode==='daily') {await saveDaily(false);return;}
    if(locked.current || !chosen.length) return;
    locked.current=true;setBusy(true);setError('');
    const account=chosen[0], date=String(new FormData(form).get('month')||'');
    try {
      const response=await fetch('/api/meta/reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,accountId:account.id,month:date,inputs,skillName:monthlySkill,skillSha:reportSkills.find(s=>s.name===monthlySkill)?.sha,researchClient:researchClient||undefined})});
      const data=await response.json();
      if(!response.ok){if(data.error?.includes('skill version'))void loadReportingSkills();throw new Error(data.error||'Report unavailable.');}
      if(data.planError&&run){setError(data.planError+' The previous plan remains available.');return;}
      setRun({mode,date,inputs:{...inputs},entries:[{account,report:data.report,plan:data.plan,planError:data.planError}]});
    } catch(e) {setError(e instanceof Error?e.message:'Plan unavailable.');}
    finally {locked.current=false;setBusy(false);}
  }

  function monthlyDownload() {
    const content = paper.current?.querySelector('.report-paper')?.cloneNode(true) as HTMLElement | undefined;
    if (!content || !run) return '';
    const doc = document.implementation.createHTMLDocument('Tossdown · ' + (run.mode === 'daily' ? 'Daily account report' : 'Next-month ad plan'));
    const meta = doc.createElement('meta'); meta.setAttribute('charset','utf-8'); doc.head.prepend(meta);
    const viewport = doc.createElement('meta'); viewport.name='viewport'; viewport.content='width=device-width, initial-scale=1'; doc.head.append(viewport);
    const style = doc.createElement('style');
    const rules: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      try { for (const rule of Array.from(sheet.cssRules)) if (/report-paper|rep-|cg-|window-week|window-month|^:root/.test(rule.cssText)) rules.push(rule.cssText); } catch { /* skip unrelated cross-origin styles */ }
    }
    style.textContent = portableFontStyles+'body{margin:20px auto;max-width:1250px;padding:8px;font:14px/1.6 Poppins,system-ui,sans-serif;color:#242124}*{box-sizing:border-box}' + rules.join('\n');
    doc.head.append(style); doc.body.append(content);
    const file = new Blob(['<!doctype html>\n',doc.documentElement.outerHTML],{type:'text/html;charset=utf-8'});
    return URL.createObjectURL(file);
  }
  useEffect(()=>{
    if(!run){setMonthlyUrl('');return;}
    const url=monthlyDownload();setMonthlyUrl(url);
    return()=>{if(url)URL.revokeObjectURL(url);};
  },[run]);
  return <WorkspaceShell active="reports" status={loaded ? 'Connected' : undefined}><div className="rep-workspace">
    <header><h1>Client reports</h1><p>Review account delivery or prepare a monthly campaign plan.</p></header>
    <nav className="rep-mode rep-nav" aria-label="Report type">{(['daily','plan'] as const).map(m=><button type="button" key={m} disabled={busy} aria-pressed={m===mode} onClick={()=>{setMode(m);setQuery('');window.history.replaceState(null,'',m==='daily'?'/reports':'/reports?view=monthly');}}>{m==='daily'?'Daily report':'Monthly plan'}</button>)}</nav>
    {skillError&&<p role="alert">{skillError} <button type="button" onClick={()=>void loadReportingSkills()}>Retry skill loading</button></p>}
    {mode==='daily'&&loaded&&<section className="rep-portfolio" aria-label="Active reporting portfolio"><div><strong>{activeClients.length} assigned brands · {assigned.accountIds.length} connected accounts</strong><small>{saved?.portfolioId===activePortfolioId?'The saved report covers the assigned reporting portfolio.':'Update the report to include the assigned reporting portfolio.'} All connected accounts remain available in selectors.</small>{assigned.missing.length>0&&<small>{assigned.missing.map(client=>client.name).join(', ')}: Meta account access is unavailable.</small>}</div><button type="button" disabled={busy} onClick={()=>{setSelected(assigned.accountIds);setTemplate(activeReportTemplate(saved?.template));setEditing(true);}}>Use assigned accounts</button></section>}
    {mode==='daily' && dailyError && <p role="alert">{dailyError} <button type="button" onClick={()=>void openDaily()}>Reload saved report</button></p>}
    {mode==='daily' && saved && <section className="workspace-card rep-saved"><div><strong>Daily report through {saved.date}</strong><small>{saved.accountIds.length} accounts · Saved {new Date(saved.savedAt).toLocaleString()} · {saved.skill?'Skill '+saved.skill.name+' · v'+saved.skill.sha.slice(0,8):'Earlier report — update to run the reporting skill'}</small></div><button type="button" disabled={busy || !dailyReady || job?.status==='running' || job?.status==='failed' || !reportSkills.some(s=>s.name===dailySkill)} onClick={()=>void saveDaily(true)}>{busy?'Updating…':'Update report'}</button><button type="button" disabled={busy} aria-expanded={editing} onClick={()=>setEditing(!editing)}>{editing?'Close settings':'Report settings'}</button></section>}
    {mode==='daily' && job && (job.status==='running'||job.status==='failed') && <section className="workspace-card" aria-label="Daily update progress"><p role="status"><strong>{job.done} of {job.total} accounts reviewed</strong> · Skill {job.skill.name} · Through {job.date}</p><p>{busy?'Reviewing evidence and running the skill. Keep this page open to continue the queued accounts.':'The pending update is saved. Resume it to continue.'} Your last saved report remains available.</p>{job.error&&!busy&&<p role="alert">{job.error}</p>}<progress value={job.done} max={job.total} aria-label="Accounts reviewed"/><div className="workspace-actions"><button type="button" disabled={busy} onClick={()=>void resumeDaily()}>Resume update</button><button type="button" disabled={busy} onClick={()=>void discardPending()}>Discard pending update</button></div></section>}
    {mode==='daily'&&saved?.runs?.length ? <details className="rep-paste-template"><summary>Skill execution records</summary><p>Each record identifies the actual skill version, model, evidence hash and validated output.</p><ul>{saved.runs.map((r,i)=><li key={r.id}>{accounts.find(a=>a.id===saved.accountIds[i])?.name||saved.accountIds[i]} · <a href={'/api/meta/reports/runs?runId='+r.id} target="_blank" rel="noreferrer">Analysis record ↗</a> · <a href={'/api/meta/reports/runs?runId='+r.id+'&file=evidence'} target="_blank" rel="noreferrer">Evidence ↗</a></li>)}</ul></details>:null}
    {(mode==='plan' || editing || !saved) && (!loaded ? <section className="workspace-card"><p>{denied ? 'Use your approved Google account to open reports.' : error || 'Loading Meta accounts…'}</p>{denied ? <button onClick={() => void signIn('google',{callbackUrl:'/reports'})}>Sign in with Google</button> : error && <button onClick={() => void connect()}>Retry</button>}</section> :
    <form className="workspace-card rep-form" onSubmit={e => { e.preventDefault(); void generate(e.currentTarget); }}><fieldset disabled={busy}><legend>Report setup</legend>
      <label>Reporting skill<select disabled={!reportSkills.length} value={mode==='daily'?dailySkill:monthlySkill} onChange={e=>mode==='daily'?setDailySkill(e.target.value):setMonthlySkill(e.target.value)}><option value="">Choose a reporting skill</option>{reportSkills.filter(s=>s.reportType===(mode==='daily'?'daily':'monthly')).map(s=><option key={s.name} value={s.name}>{s.name.split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ')} · version {s.sha.slice(0,8)}</option>)}</select><small>The selected skill and its reference files drive the written review. Metrics and layout use the report template.</small></label>

      {mode === 'daily' ? <>
        <div className="rep-inputs"><label>Through date<input type="date" name="end" defaultValue={end} required onInput={e=>setEnd(e.currentTarget.value)}/></label><label>Find ad accounts<input type="search" value={query} placeholder="Name or account ID" onChange={e=>setQuery(e.target.value)}/></label></div>
        <div className="rep-template"><div><strong>{template?'Daily report template':'Use a previous daily report'}</strong><small>{template?template.clients.length+' expected brands · '+portfolio.matches.size+' matched accounts':'Choose the original daily HTML to use its client list and KPI cards. Figures are read from Meta for the selected dates.'}</small></div><label className="rep-file">{template?'Replace template':'Open template'}<input type="file" accept=".html,.htm,text/html" aria-label="Open daily HTML template" onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';void loadTemplate(file);}}/></label>{template && <button type="button" onClick={()=>useTemplate(template,accounts)}>Select template accounts</button>}<small role="status">{templateNote}</small></div>
        <details className="rep-paste-template"><summary>Paste a template</summary><label>Daily report HTML or template settings<textarea rows={3} value={templateText} maxLength={3_000_000} onChange={e=>setTemplateText(e.target.value)} /></label><button type="button" disabled={!templateText.trim()} onClick={()=>applyTemplateText(templateText)}>Apply template</button></details>
        <div className="rep-selectbar"><strong>{selected.length} selected</strong><button type="button" onClick={()=>setSelected([...new Set([...selected,...matches.map(a=>a.id)])])}>Select {query ? 'matches' : 'all'}</button><button type="button" onClick={()=>setSelected([])}>Clear</button></div>
        <div className="rep-accounts">{matches.map(a=><label key={a.id}><input type="checkbox" checked={selected.includes(a.id)} onChange={e=>setSelected(e.target.checked?[...selected,a.id]:selected.filter(id=>id!==a.id))}/><span>{a.name}<small>{a.currency} · {a.id}</small></span></label>)}{!matches.length && <p>No matching account</p>}</div></> :
      <><div className="rep-inputs"><label>Ad account<select required value={monthlyId} onChange={e=>{setMonthlyId(e.target.value);setResearchClient('');setInputs(emptyInputs);setRun(null);}}><option value="">Choose account</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.currency} · {a.id}</option>)}</select></label><label>Plan month<input type="month" name="month" required defaultValue={month} onInput={e=>{setMonth(e.currentTarget.value);setInputs(emptyInputs);setRun(null);}}/></label></div>
      <div className="rep-inputs"><label>Approved plan month cap {chosen[0]?.currency}<input type="number" min="0.01" max="100000000000" step="any" placeholder="Optional" value={inputs.cap ?? ''} onChange={e=>setInputs({...inputs,cap:e.target.value ? Number(e.target.value) : undefined})}/></label><label>Previous month cap {chosen[0]?.currency}<input type="number" min="0.01" max="100000000000" step="any" placeholder="Optional" value={inputs.previousCap ?? ''} onChange={e=>setInputs({...inputs,previousCap:e.target.value ? Number(e.target.value) : undefined})}/></label></div>
      <label>Fetch current competitor ads from Foreplay<select value={researchClient} onChange={e=>setResearchClient(e.target.value)}><option value="">Skip paid lookup</option>{researchClients.filter(c=>!c.metaAccountId||c.metaAccountId===monthlyId).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><small>Uses up to ten advertisers from the linked board (one lookup credit), or the client’s confirmed advertisers. Up to 20 ads at one credit per returned ad.</small></label>
      <label>Client brief<textarea value={inputs.brief} maxLength={4000} placeholder="Goals, market, approved offers and brand voice" onChange={e=>setInputs({...inputs,brief:e.target.value})}/></label>
      <div className="rep-inputs"><label>Competitor evidence<textarea maxLength={4000} value={inputs.competitors} placeholder="Observed ad, source link and date" onChange={e=>setInputs({...inputs,competitors:e.target.value})}/><a href="/competitors" target="_blank" rel="noreferrer">Open competitor research ↗</a></label>
      <label>Market event<textarea maxLength={2000} value={inputs.event} placeholder="Event, date, market and source" onChange={e=>setInputs({...inputs,event:e.target.value})}/></label></div></>}
      <button className="rep-primary" disabled={!chosen.length || busy || (mode==='daily' && (!dailyReady || job?.status==='running' || job?.status==='failed')) || !reportSkills.some(s=>s.name===(mode==='daily'?dailySkill:monthlySkill))} type="submit">{busy ? 'Preparing report…' : mode==='daily' ? 'Generate and save report' : 'Draft monthly plan'}</button>
      </fieldset></form>)}
    {mode==='plan' && loaded && error && <p role="alert">{error}</p>}
    {mode==='daily' && saved && dailyHtml && <section className="rep-daily-preview"><div className="rep-exports">{dailyUrl && <><a href={dailyUrl} target="_blank" rel="noopener noreferrer">Open full report ↗</a><a href={dailyUrl} download={'tossdown-daily-'+saved.date+'.html'}>Download HTML</a></>}<button onClick={()=>frame.current?.contentWindow?.postMessage('print-daily-report','*')}>Print / save PDF</button></div><iframe ref={frame} title="Meta Ads daily report" sandbox="allow-scripts allow-modals" srcDoc={dailyHtml}/></section>}
    {mode==='plan' && run?.mode==='plan' && <section ref={paper}><div className="rep-exports">{monthlyUrl&&<a href={monthlyUrl} download={'tossdown-plan-'+run.date+'.html'}>Download HTML</a>}<button onClick={()=>window.print()}>Print / save PDF</button></div><ReportView run={run}/></section>}
    </div></WorkspaceShell>;
}
