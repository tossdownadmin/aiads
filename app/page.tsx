import WorkspaceShell from './workspace-shell';
import UiIcon, { type IconName } from './ui-icons';

const destinations: Array<{ href: string; label: string; title: string; description: string; action: string; icon: IconName }> = [
  { href: '/reports', label: 'CLIENT REPORTS', title: 'Keep your portfolio in view', description: 'Read saved daily reports, review business profiles, and prepare monthly campaign plans.', action: 'Open reports', icon: 'report' },
  { href: '/workbench', label: 'ACCOUNT AUDITS', title: 'Review your Meta campaigns', description: 'Choose an account, reporting window, and Tossdown review method. See campaign metrics and evidence-backed findings.', action: 'Open audits', icon: 'audit' },
  { href: '/competitors', label: 'COMPETITOR RESEARCH', title: 'Find competitor ads', description: 'Select a client brand, verify the advertisers, and inspect the creative returned by Foreplay or Meta.', action: 'Open research', icon: 'research' },
  { href: '/registry', label: 'SKILLS REGISTRY', title: 'Explore Tossdown methods', description: 'See the methods available now, the next workflows, and reviewed external skills.', action: 'Open registry', icon: 'skills' },
];

export default function Home() {
  return <WorkspaceShell active="home"><header className="craft-hero workspace-home-hero"><div className="craft-hero-main"><div><h1>Your ads workspace</h1><p>Review account performance, explore competitor creative, and manage analysis skills.</p></div></div></header>
    <div className="workspace-home-grid">{destinations.map(destination => <a key={destination.href} className="workspace-home-card" href={destination.href}><span className="workspace-home-icon"><UiIcon name={destination.icon} size={21} /></span><span className="workspace-home-label">{destination.label}</span><h2>{destination.title}</h2><p>{destination.description}</p><strong>{destination.action} <span aria-hidden="true">→</span></strong></a>)}</div>
    <section className="workspace-card workspace-home-note"><UiIcon name="shield" /><div><strong>Read-only advertising access</strong><p>Audits and research retrieve evidence. They do not change campaigns or ad accounts.</p></div></section>
  </WorkspaceShell>;
}
