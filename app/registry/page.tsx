'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import WorkspaceShell from '../workspace-shell';

type Row = { name: string; description: string; source: string; license?: string; status: string; risk: string; findings: string[]; categories: string[]; platforms: string[]; pathname: string; sha: string };
type Approved = { contract?:string; reportType?:'daily'|'monthly'; name: string; description: string; source: string; categories: string[]; sha: string };
const nextWorkflows = [
  {name:'Business outcome reconciliation',need:'Requires verified CRM or fulfilled-order/POS data before reporting qualified leads or profit.'},
  {name:'Original creative test briefs',need:'Follows accurate monitoring, approved briefs and a reviewed creative workflow.'},
];

export default function Registry() {
  const [rows, setRows] = useState<Row[]>([]);
  const [approved, setApproved] = useState<Approved[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [signInRequired, setSignInRequired] = useState(false);
  const [filter, setFilter] = useState('');
  const [syncErrors, setSyncErrors] = useState<string[]>([]);
  const headers = { 'Content-Type': 'application/json' };
  const visibleRows = rows.filter(row => `${row.name} ${row.description} ${row.source} ${row.categories.join(' ')}`.toLowerCase().includes(filter.toLowerCase()));

  async function load() {
    const [stagedResponse, approvedResponse] = await Promise.all([fetch('/api/skills/staging', { cache: 'no-store' }), fetch('/api/skills/approved', { cache: 'no-store' })]);
    if (stagedResponse.status === 401 || approvedResponse.status === 401) { setSignInRequired(true); return; }
    const [staged, active] = await Promise.all([stagedResponse.json(), approvedResponse.json()]);
    if (!stagedResponse.ok) throw new Error(staged.error || 'Unable to load staged skills');
    if (!approvedResponse.ok) throw new Error(active.error || 'Unable to load approved skills');
    const activeRows = (active.skills || []) as Approved[];
    setApproved(activeRows);
    setRows(((staged.skills || []) as Row[]).filter(row => !activeRows.some(item => item.name === row.name && item.source === row.source && item.sha === row.sha)));
  }
  useEffect(() => { void load().catch(error => setMessage(error.message)); }, []);

  async function sync() {
    setBusy(true); setMessage('Syncing configured skill sources…');
    try {
      const response = await fetch('/api/skills/sync', { method: 'POST', headers });
      if (response.status === 401) { setSignInRequired(true); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Sync failed');
      await load();
      setSyncErrors(data.errors || []);
      setMessage(`Sync complete: ${data.summary.found} relevant skills found; ${data.errors.length} source or file issues.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Sync failed'); }
    finally { setBusy(false); }
  }
  async function review(row: Row, decision: 'approved' | 'rejected') {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/skills/review', { method: 'POST', headers, body: JSON.stringify({ pathname: row.pathname, decision }) });
      if (response.status === 401) { setSignInRequired(true); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Review failed');
      await load(); setMessage(`${data.name} ${decision}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Review failed'); }
    finally { setBusy(false); }
  }

  return <WorkspaceShell active="registry" status={signInRequired ? 'Sign-in required' : 'Skills workspace'}>
    <header className="craft-hero"><p className="craft-crumb">WORKSPACE / SKILLS REGISTRY</p><div className="craft-hero-main"><span className="craft-hero-icon" aria-hidden="true">▦</span><div><h1>Analysis methods</h1><p>Use Tossdown methods now, and review optional external methods before they appear in a workspace.</p></div></div></header>
    {signInRequired ? <section className="workspace-card workspace-access"><h2>Sign in to manage skills</h2><p>Use your approved Tossdown Google account.</p><button onClick={() => void signIn('google', { callbackUrl: '/registry' })}>Sign in with Google</button></section> : <>
      <section className="workspace-card"><div className="workspace-card-heading"><div><h2>Skill sources</h2><p>Tossdown methods ship with this app. Sync only checks optional external sources, which require review.</p></div><div className="workspace-actions"><button disabled={busy} onClick={() => void sync()}>{busy ? 'Working…' : 'Sync external sources'}</button><button className="workspace-secondary" disabled={busy} onClick={() => void load().then(() => setMessage('Skill list refreshed.')).catch(error => setMessage(error.message))}>Refresh</button></div></div>{message && <p className="workspace-hint" role="status">{message}</p>}{syncErrors.length > 0 && <details className="workspace-sync-errors"><summary>{syncErrors.length} source or file issues</summary><ul>{syncErrors.map((issue, index) => <li key={`${issue}-${index}`}>{issue}</li>)}</ul></details>}</section>
      <section className="workspace-card"><h2>Tossdown methods</h2><p className="workspace-muted">These read-only methods are available now. The operations monitor runs on the Monitoring board. Other methods are available in Account audits, Competitor research and Client reports.</p><div className="workspace-own-skills">{approved.filter(item => item.source === 'tossdown-aiads').map(item => <article key={`${item.name}-${item.sha}`}><strong>{item.name.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ')}</strong><p>{item.description}</p><small>{item.contract==='meta-monitor-v1'?'Account monitoring':item.reportType==='daily'?'Daily reports':item.reportType==='monthly'?'Monthly plans':item.categories.includes('competitor_intel') ? 'Competitor research' : 'Account audits'} · version {item.sha.slice(0, 8)}</small></article>)}</div></section>
      <section className="workspace-card"><h2>Next workflows</h2><p className="workspace-muted">The supplied archive also covers these ideas. They will become tools when the required evidence and review screens exist.</p><div className="workspace-own-skills">{nextWorkflows.map(item => <article key={item.name}><strong>{item.name}</strong><p>{item.need}</p><small>Not active</small></article>)}</div></section>
      <div className="workspace-two-column"><section className="workspace-card"><div className="workspace-card-heading"><div><h2>Ready for review</h2><p>{rows.length} staged version{rows.length === 1 ? '' : 's'}</p></div></div><label className="workspace-filter"><span>Find a skill</span><input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Search by name, source, or category" /></label><div className="workspace-review-list">{visibleRows.map(row => <article className="workspace-review" key={row.pathname}><div className="workspace-review-head"><div><h3>{row.name}</h3><p>{row.description}</p></div><span className={`risk ${row.risk}`}>{row.risk} risk</span></div><div className="workspace-tags">{row.categories.map(item => <span key={item}>{item}</span>)}{row.platforms.map(item => <span key={item}>{item}</span>)}</div><p className="workspace-meta">{row.source} · version {row.sha.slice(0, 10)} · {row.license || 'No license; reference only'}</p>{row.findings?.length > 0 && <ul>{row.findings.map(item => <li key={item}>{item}</li>)}</ul>}<div className="workspace-actions"><button disabled={busy || row.risk === 'high' || row.status === 'reference_only'} onClick={() => void review(row, 'approved')}>Approve for use</button><button className="workspace-secondary" disabled={busy} onClick={() => void review(row, 'rejected')}>Reject</button></div></article>)}{!visibleRows.length && <p className="workspace-hint">{filter ? 'No skills match that search.' : 'Nothing pending. Sync sources to check for new versions.'}</p>}</div></section>
        <aside className="workspace-card"><h2>Approved external skills</h2><p className="workspace-muted">Reviewed methods from connected sources.</p><div className="workspace-approved">{approved.filter(item => item.source !== 'tossdown-aiads').map(item => <div key={`${item.source}-${item.name}-${item.sha}`}><strong>{item.name}</strong><small>{item.source} · {item.sha.slice(0, 10)}</small></div>)}{!approved.some(item => item.source !== 'tossdown-aiads') && <p className="workspace-hint">No external methods approved.</p>}</div><div className="workspace-actions"><a className="workspace-link-button" href="/workbench">Open audits →</a><a className="workspace-link-button" href="/competitors">Open research →</a></div></aside></div>
    </>}
  </WorkspaceShell>;
}
