'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import UiIcon, { type IconName } from './ui-icons';

type Page = 'reports' | 'home' | 'workbench' | 'competitors' | 'registry';
const pages: Array<{ id: Page; href: string; label: string; icon: IconName; detail?: string }> = [
  { id: 'home', href: '/', label: 'Home', icon: 'home' },
  { id: 'workbench', href: '/workbench', label: 'Account audits', icon: 'audit', detail: 'Review Meta campaigns' },
  { id: 'reports', href: '/reports', label: 'Client reports', icon: 'report', detail: 'Daily reports and monthly plans' },
  { id: 'competitors', href: '/competitors', label: 'Competitor research', icon: 'research', detail: 'Find and study public ads' },
  { id: 'registry', href: '/registry', label: 'Skills registry', icon: 'skills', detail: 'Review analysis skills' },
];

export default function WorkspaceShell({ active, children, status, className = '' }: { active: Page; children: ReactNode; status?: string; className?: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState('');
  const menu = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSidebarOpen(false); menu.current?.focus(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);
  const matches = query.trim() ? pages.filter(page => `${page.label} ${page.detail || ''}`.toLowerCase().includes(query.toLowerCase())) : [];
  return <div className={`craft-shell agency-theme ${className}`}>
    <a href="#workspace-content" className="workspace-skip">Skip to content</a>
    <aside id="workspace-navigation" className={`craft-sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Main navigation">
      <a className="craft-brand" href="/" aria-label="Tossdown Ads home"><strong>ads</strong><span>by tossdown</span></a>
      <button className="craft-sidebar-close" type="button" aria-label="Close navigation" onClick={() => { setSidebarOpen(false); menu.current?.focus(); }}><UiIcon name="close" /></button>
      <div className="craft-brand-search"><UiIcon name="search" size={17} /><input aria-label="Jump to workspace page" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a workspace page" />{query && <div className="craft-search-results">{matches.map(page => <a key={page.id} href={page.href}>{page.label}<small>{page.detail}</small></a>)}{matches.length === 0 && <p>No matching page</p>}</div>}</div>
      <nav className="craft-side-group" aria-label="Workspace pages"><p>WORKSPACE</p>{pages.map(page => <a key={page.id} href={page.href} className={active === page.id ? 'active' : undefined} aria-current={active === page.id ? 'page' : undefined}><span><UiIcon name={page.icon} /></span><span>{page.label}</span></a>)}</nav>
      <div className="craft-side-foot"><UiIcon name="shield" size={19} /><span><strong>Read-only advertising access</strong><small><span className={`status-light ${status === 'Connected' ? '' : 'pending'}`} />{status || 'Research workspace'}</small></span></div>
    </aside>
    {sidebarOpen && <button className="craft-sidebar-scrim" type="button" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <div className="craft-page"><nav className="craft-topbar" aria-label="Workspace toolbar"><button ref={menu} className="craft-menu" type="button" aria-label="Toggle navigation" aria-controls="workspace-navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(open => !open)}><UiIcon name="menu" /></button><a href="/" className="craft-mobile-brand">ads <span>by tossdown</span></a></nav>
      <main id="workspace-content" className="craft-content">{children}</main>
    </div>
  </div>;
}
