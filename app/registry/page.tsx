'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import WorkspaceShell from '../workspace-shell';

type Row = { name: string; description: string; source: string; license?: string; status: string; risk: string; findings: string[]; categories: string[]; platforms: string[]; pathname: string; sha: string };
type Approved = { name: string; description: string; source: string; categories: string[]; sha: string };

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
    <header className="craft-hero"><p className="craft-crumb">WORKSPACE / SKILLS REGISTRY</p><div className="craft-hero-main"><span className="craft-hero-icon" aria-hidden="true">▦</span><div><h1>Review analysis skills</h1><p>Sync sources, review the findings, and approve a version for audits or research.</p></div></div><ol className="craft-steps" aria-label="Skill review steps"><li className="active"><span>1</span> Sync sources</li><li className={rows.length ? 'active' : ''}><span>2</span> Review versions</li><li className={approved.length ? 'active' : ''}><span>3</span> Use approved skills</li></ol></header>
    {signInRequired ? <section className="workspace-card workspace-access"><h2>Sign in to manage skills</h2><p>Use your approved Tossdown Google account.</p><button onClick={() => void signIn('google', { callbackUrl: '/registry' })}>Sign in with Google</button></section> : <>
      <section className="workspace-card"><div className="workspace-card-heading"><div><h2>Skill sources</h2><p>Sync the configured GitHub sources and built-in skills.</p></div><div className="workspace-actions"><button disabled={busy} onClick={() => void sync()}>{busy ? 'Working…' : 'Sync sources'}</button><button className="workspace-secondary" disabled={busy} onClick={() => void load().then(() => setMessage('Skill list refreshed.')).catch(error => setMessage(error.message))}>Refresh</button></div></div>{message && <p className="workspace-hint" role="status">{message}</p>}{syncErrors.length > 0 && <details className="workspace-sync-errors"><summary>{syncErrors.length} source or file issues</summary><ul>{syncErrors.map((issue, index) => <li key={`${issue}-${index}`}>{issue}</li>)}</ul></details>}</section>
      <div className="workspace-two-column"><section className="workspace-card"><div className="workspace-card-heading"><div><h2>Ready for review</h2><p>{rows.length} staged version{rows.length === 1 ? '' : 's'}</p></div></div><label className="workspace-filter"><span>Find a skill</span><input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Search by name, source, or category" /></label><div className="workspace-review-list">{visibleRows.map(row => <article className="workspace-review" key={row.pathname}><div className="workspace-review-head"><div><h3>{row.name}</h3><p>{row.description}</p></div><span className={`risk ${row.risk}`}>{row.risk} risk</span></div><div className="workspace-tags">{row.categories.map(item => <span key={item}>{item}</span>)}{row.platforms.map(item => <span key={item}>{item}</span>)}</div><p className="workspace-meta">{row.source} · version {row.sha.slice(0, 10)} · {row.license || 'No license; reference only'}</p>{row.findings?.length > 0 && <ul>{row.findings.map(item => <li key={item}>{item}</li>)}</ul>}<div className="workspace-actions"><button disabled={busy || row.risk === 'high' || row.status === 'reference_only'} onClick={() => void review(row, 'approved')}>Approve for use</button><button className="workspace-secondary" disabled={busy} onClick={() => void review(row, 'rejected')}>Reject</button></div></article>)}{!visibleRows.length && <p className="workspace-hint">{filter ? 'No skills match that search.' : 'Nothing pending. Sync sources to check for new versions.'}</p>}</div></section>
        <aside className="workspace-card"><h2>Approved for use</h2><p className="workspace-muted">These versions are available to the audit and research workspaces.</p><div className="workspace-approved">{approved.map(item => <div key={`${item.source}-${item.name}-${item.sha}`}><strong>{item.name}</strong><small>{item.source} · {item.sha.slice(0, 10)}</small></div>)}{!approved.length && <p className="workspace-hint">No approved skills yet.</p>}</div><div className="workspace-actions"><a className="workspace-link-button" href="/workbench">Open audits →</a><a className="workspace-link-button" href="/competitors">Open research →</a></div></aside></div>
    </>}
  </WorkspaceShell>;
}
