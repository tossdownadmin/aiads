import { SAFETY_POLICY } from '../lib/skills/policy';

export default function Home() {
  return <main className="home-shell">
    <header className="home-header"><a className="product-brand" href="/"><span className="mark">T</span><span><strong>Tossdown</strong><small>ADS INTELLIGENCE</small></span></a><nav className="product-links"><a href="/workbench">Account audits</a><a href="/competitors">Competitor research</a><a href="/registry">Skills registry</a></nav></header>
    <section className="home-hero"><p className="eyebrow">PAID MEDIA WORKSPACE</p><h1>Audit what you run.<br />Research what the market runs.</h1><p>One read-only workspace for campaign audits, competitor creative research, and versioned ad skills.</p></section>
    <section className="module-grid">
      <a className="module-card" href="/workbench"><span className="module-index">01 / ACCOUNT AUDITS</span><div className="module-icon">↗</div><h2>Review connected campaigns</h2><p>Select a Meta account, audit its active campaigns, and inspect metric evidence with an approved skill.</p><span className="module-action">Open audit workspace <b>→</b></span></a>
      <a className="module-card accent" href="/competitors"><span className="module-index">02 / COMPETITOR RESEARCH</span><div className="module-icon">⌕</div><h2>Study competitor creative</h2><p>Search source-labeled ad-library records, review the original, then analyze selected ads for messaging patterns.</p><span className="module-action">Explore ad library <b>→</b></span></a>
    </section>
    <section className="home-foot"><div><span className="eyebrow">SAFETY</span><strong>{SAFETY_POLICY.readOnlyByDefault ? 'Read-only by default' : 'Review required'}</strong><p>AI explains supplied evidence. It does not change campaigns.</p></div><a href="/registry">Manage approved skills <b>→</b></a></section>
  </main>;
}
