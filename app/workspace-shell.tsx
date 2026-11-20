'use client';

import { useState, type ReactNode } from 'react';
import BrandIcon from './brand-icon';

type Page = 'reports' | 'home' | 'workbench' | 'competitors' | 'registry';
const pages: Array<{ id: Page; href: string; label: string; icon: string; detail?: string }> = [
  { id: 'home', href: '/', label: 'Home', icon: '⌂' },
  { id: 'workbench', href: '/workbench', label: 'Account audits', icon: '▤', detail: 'Review Meta campaigns' },
  { id: 'reports', href: '/reports', label: 'Client reports', icon: '▥', detail: 'Daily reports and monthly plans' },
  { id: 'competitors', href: '/competitors', label: 'Competitor research', icon: '↻', detail: 'Find and study public ads' },
  { id: 'registry', href: '/registry', label: 'Skills registry', icon: '▦', detail: 'Review analysis skills' },
];

export default function WorkspaceShell({ active, children, status }: { active: Page; children: ReactNode; status?: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState('');
  const matches = query.trim() ? pages.filter(page => `${page.label} ${page.detail || ''}`.toLowerCase().includes(query.toLowerCase())) : [];
  return <main className="craft-shell">
    <aside className={`craft-sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Main navigation">
      <a className="craft-brand" href="/"><BrandIcon className="craft-brand-mark" /><strong>Tossdown</strong></a>
      <div className="craft-side-group"><p>WORKSPACE</p>{pages.map(page => <a key={page.id} href={page.href} className={active === page.id ? 'active' : undefined} aria-current={active === page.id ? 'page' : undefined}><span aria-hidden="true">{page.icon}</span><span>{page.label}{active === page.id && page.detail && <small>{page.detail}</small>}</span></a>)}</div>
      <div className="craft-side-foot"><BrandIcon className="craft-side-avatar" size={34} /><span><strong>Tossdown Ads</strong><small>Research workspace</small></span></div>
    </aside>
    {sidebarOpen && <button className="craft-sidebar-scrim" type="button" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <div className="craft-page"><nav className="craft-topbar" aria-label="Workspace toolbar"><button className="craft-menu" type="button" aria-label="Toggle navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(open => !open)}>☰</button><div className="craft-brand-search"><span aria-hidden="true">⌕</span><input aria-label="Jump to workspace page" value={query} onChange={event => setQuery(event.target.value)} placeholder="Jump to a workspace page..." />{query && <div className="craft-search-results">{matches.map(page => <a key={page.id} href={page.href}>{page.label}<small>{page.detail}</small></a>)}{matches.length === 0 && <p>No matching page</p>}</div>}</div><div className="craft-top-status"><span className={`status-light ${status === 'Connected' ? '' : 'pending'}`} /><span>{status || 'Read-only workspace'}</span></div></nav>
      <div className="craft-content"><div className="craft-page-actions"><a href="/">← &nbsp; Workspace home</a><div className="craft-page-tabs"><a className={active === 'workbench' ? 'active' : undefined} href="/workbench">◎ &nbsp; Audits</a><a className={active === 'competitors' ? 'active' : undefined} href="/competitors">✦ &nbsp; Research</a><a className={active === 'registry' ? 'active' : undefined} href="/registry">▤ &nbsp; Skills</a></div></div>{children}</div>
    </div>
  </main>;
}
