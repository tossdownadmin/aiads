'use client';

import { useEffect, useMemo, useState } from 'react';

type Skill = { name: string; description: string; categories: string[]; platforms: string[]; status: string; license?: string; sha: string };
type Account = { id: string; name: string; status: number; currency: string; timezone?: string };
type Finding = { title: string; severity: 'high' | 'medium' | 'low' | 'info'; evidence: string; recommendation: string };
type AuditResult = {
  skill: { name: string; description: string; sha: string };
  account: { id: string; name: string; currency: string; timezone?: string };
  period: 'last_7d' | 'last_30d';
  summary: { campaigns: number; totalSpend: number; currency: string | null };
  campaigns: unknown[];
  issues: Array<{ title: string; campaign: string; spend: number; frequency: number; ctr: number }>;
  analysis: { status: 'complete' | 'not_configured' | 'unavailable'; summary?: string; findings?: Finding[]; dataGaps?: string[]; message?: string };
  notice: string;
};

export default function Workbench() {
  const [connected, setConnected] = useState(false);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [skill, setSkill] = useState('');
  const [account, setAccount] = useState('');
  const [period, setPeriod] = useState<'last_7d' | 'last_30d'>('last_7d');
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const headers = useMemo(() => ({ 'Content-Type': 'application/json' }), []);

  async function connect() {
    setBusy(true);
    setError('');
    try {
      const [skillsResponse, accountsResponse] = await Promise.all([
        fetch('/api/skills/approved', { cache: 'no-store' }),
        fetch('/api/meta/accounts', { cache: 'no-store' }),
      ]);
      const skillsData = await skillsResponse.json();
      const accountsData = await accountsResponse.json();
      if (!skillsResponse.ok) throw new Error(skillsData.error || 'Could not load skills');
      if (!accountsResponse.ok) throw new Error(accountsData.error || 'Could not load Meta accounts');
      setSkills(skillsData.skills);
      setAccounts(accountsData.accounts);
      setConnected(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Connection failed');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void connect(); }, []);

  async function runAudit() {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const response = await fetch('/api/meta/audit', {
        method: 'POST',
        headers,
        body: JSON.stringify({ skillName: skill, accountId: account, period }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Audit failed');
      setResult(data as AuditResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Audit failed');
    } finally {
      setBusy(false);
    }
  }

  return <main className="workbench">
    <header>
      <a className="back" href="/">← Registry</a>
      <div>
        <p className="eyebrow">AUDIT WORKSPACE</p>
        <h1>Run an account audit</h1>
        <p className="muted">Choose an approved skill, connect to your Meta accounts, and inspect evidence-backed results.</p>
      </div>
      <span className="badge">READ ONLY</span>
    </header>

    {!connected ? <section className="connect-card">
      <div className="step">CONNECTING</div>
      <h2>Loading audit workspace</h2>
      <p>{error || 'Loading approved skills and Meta accounts…'}</p>
      {error && <button onClick={() => void connect()}>Retry</button>}
    </section> : <>
      <section className="selector-grid">
        <article><label>1. Audit skill
          <select value={skill} onChange={event => setSkill(event.target.value)}>
            <option value="">Choose an approved skill</option>
            {skills.map(item => <option key={`${item.name}-${item.sha}`} value={item.name}>{item.name} · {item.categories?.[0] || 'ads'}</option>)}
          </select>
          <small>{skills.find(item => item.name === skill)?.description || `${skills.length} approved skills available`}</small>
        </label></article>
        <article><label>2. Ad account
          <select value={account} onChange={event => setAccount(event.target.value)}>
            <option value="">Choose a Meta ad account</option>
            {accounts.map(item => <option key={item.id} value={item.id}>{item.name} · {item.currency}</option>)}
          </select>
          <small>{accounts.length} accounts available to this Meta token</small>
        </label></article>
        <article><label>3. Reporting window
          <select value={period} onChange={event => setPeriod(event.target.value as 'last_7d' | 'last_30d')}>
            <option value="last_7d">Last 7 days</option>
            <option value="last_30d">Last 30 days</option>
          </select>
          <small>Campaign-level insights</small>
        </label></article>
      </section>
      <button className="run-button" onClick={runAudit} disabled={!skill || !account || busy}>
        {busy ? 'Running audit…' : 'Run audit →'}
      </button>
      {error && <p className="error">{error}</p>}
      {skills.length === 0 && <p className="empty">No approved skills yet. Sync sources, then approve a skill in the Registry.</p>}
      {result && <section className="results">
        <div className="result-head">
          <div>
            <p className="eyebrow">AUDIT RESULTS</p>
            <h2>{result.skill.name}</h2>
            <p className="muted">{result.account.name} · {result.period === 'last_7d' ? 'Last 7 days' : 'Last 30 days'} · skill version {result.skill.sha.slice(0, 8)}</p>
          </div>
          <span className="badge">{result.summary.campaigns} CAMPAIGNS</span>
        </div>
        <div className="metric-row">
          <div><small>Total spend</small><strong>{result.summary.currency || ''} {Number(result.summary.totalSpend).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></div>
          <div><small>Review flags</small><strong>{result.issues.length}</strong></div>
        </div>
        <h3>Claude audit analysis</h3>
        {result.analysis.status === 'complete' ? <>
          <p>{result.analysis.summary}</p>
          {result.analysis.findings?.map((finding, index) => <article className="finding" key={`${finding.title}-${index}`}>
            <strong>{finding.title} <span className={`risk ${finding.severity}`}>{finding.severity}</span></strong>
            <p>{finding.evidence}</p>
            <small>Recommended next step: {finding.recommendation}</small>
          </article>)}
          {!!result.analysis.dataGaps?.length && <div className="finding"><strong>Data gaps</strong><ul>{result.analysis.dataGaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul></div>}
        </> : <p className="empty">{result.analysis.message}</p>}
        <h3>Deterministic review flags</h3>
        {result.issues.length ? result.issues.map((issue, index) => <div className="finding" key={`${issue.campaign}-${issue.title}-${index}`}>
          <strong>{issue.title}</strong><span>{issue.campaign}</span>
          <small>Spend {issue.spend.toFixed(2)} · CTR {issue.ctr}% · frequency {issue.frequency}</small>
        </div>) : <p className="empty">No threshold flags for this period. Review campaign metrics below.</p>}
        <details><summary>Campaign evidence</summary><pre>{JSON.stringify(result.campaigns, null, 2)}</pre></details>
        <p className="muted footnote">{result.notice}</p>
      </section>}
    </>}
  </main>;
}
