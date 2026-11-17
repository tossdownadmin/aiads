'use client';

import { useEffect, useMemo, useState } from 'react';
import { signIn, signOut } from 'next-auth/react';
import { clientCatalog } from '../../lib/competitors/catalog';

type Skill = { name: string; description: string; categories: string[]; sha: string };
type Ad = {
  id: string;
  page_id?: string;
  page_name?: string;
  ad_creation_time?: string;
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_creative_link_descriptions?: string[];
  ad_creative_link_captions?: string[];
  ad_snapshot_url?: string;
  publisher_platforms?: string[];
  thumbnail_url?: string;
};
type SearchResult = { ads: Ad[]; after: string | null; source: string; retrievedAt: string; coverageNote: string };
type BrandCandidate = { id: string; name: string; domain: string; website?: string; reviewed?: true };
type SourceStatus = { configured: boolean; ready: boolean; signedIn?: boolean; authConfigured?: boolean };
type BrandLookup = { status: 'loading' | 'done' | 'error'; candidates: BrandCandidate[]; error?: string };
type Analysis = { status: 'complete' | 'not_configured' | 'unavailable'; summary?: string; findings?: Array<{ title: string; severity: string; evidence: string; recommendation: string }>; dataGaps?: string[]; message?: string };

const countries = [
  ['CA', 'Canada'], ['US', 'United States'], ['GB', 'United Kingdom'], ['IE', 'Ireland'],
  ['FR', 'France'], ['DE', 'Germany'], ['ES', 'Spain'], ['IT', 'Italy'], ['NL', 'Netherlands'],
  ['PK', 'Pakistan'], ['AE', 'United Arab Emirates'], ['AU', 'Australia'], ['IN', 'India'],
];

export default function CompetitorResearch() {
  const [sources, setSources] = useState<Record<string, SourceStatus>>({});
  const [source, setSource] = useState<'meta' | 'foreplay'>('foreplay');
  const [clientId, setClientId] = useState(clientCatalog[0].id);
  const clientBrand = clientCatalog.find(item => item.id === clientId) || clientCatalog[0];
  const [domain, setDomain] = useState('');
  const [candidates, setCandidates] = useState<BrandCandidate[]>([]);
  const [lookups, setLookups] = useState<Record<string, BrandLookup>>({});
  const [competitors, setCompetitors] = useState<BrandCandidate[]>([]);
  const [legacyMatches, setLegacyMatches] = useState<BrandCandidate[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillName, setSkillName] = useState('');
  const [terms, setTerms] = useState('');
  const [pageIds, setPageIds] = useState('');
  const [country, setCountry] = useState('CA');
  const [activeStatus, setActiveStatus] = useState('ACTIVE');
  const [searchType, setSearchType] = useState('KEYWORD_UNORDERED');
  const [mediaType, setMediaType] = useState('ALL');
  const [platform, setPlatform] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisSkill, setAnalysisSkill] = useState('');
  const [brandQuery, setBrandQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const headers = useMemo(() => ({ 'Content-Type': 'application/json' }), []);

  useEffect(() => {
    void Promise.all([
      fetch('/api/competitors/search', { cache: 'no-store' }).then(response => response.json()),
      fetch('/api/skills/approved', { cache: 'no-store' }).then(response => response.json()),
    ]).then(([status, skillData]) => {
      setSources(status.sources || {});
      const competitorSkills = (skillData.skills || []).filter((item: Skill) => item.categories?.includes('competitor_intel')) as Skill[];
      setSkills(competitorSkills);
      setSkillName(competitorSkills[0]?.name || '');
    }).catch(() => setSources({}));
  }, []);

  useEffect(() => {
    setCountry(clientBrand.country);
    setCompetitors([]);
    setLegacyMatches([]);
    setLookups({});
    setCandidates([]);
    setResult(null);
    setAnalysis(null);
    if (!sources.foreplay?.signedIn) return;
    let active = true;
    void fetch(`/api/competitors/selection?clientId=${encodeURIComponent(clientId)}`, { cache: 'no-store' })
      .then(async response => { if (!response.ok) throw new Error('Could not load saved advertisers.'); return response.json(); })
      .then(data => { if (active) { const saved = (data.competitors || []) as BrandCandidate[]; setCompetitors(saved.filter(item => item.reviewed === true)); setLegacyMatches(saved.filter(item => item.reviewed !== true)); } })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load saved advertisers.'); });
    return () => { active = false; };
  }, [clientId, sources.foreplay?.signedIn]);

  async function saveCompetitors(next: BrandCandidate[], legacy = legacyMatches.filter(item => !next.some(competitor => competitor.id === item.id))) {
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/competitors/selection', { method: 'PUT', headers, body: JSON.stringify({ clientId, competitors: [...next, ...legacy] }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save advertisers.');
      const saved = (data.competitors || []) as BrandCandidate[];
      setCompetitors(saved.filter(item => item.reviewed === true));
      setLegacyMatches(saved.filter(item => item.reviewed !== true));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save advertisers.'); }
    finally { setSaving(false); }
  }

  async function lookupSuggested() {
    setLookingUp(true); setError('');
    for (const suggestion of clientBrand.competitors) {
      setLookups(current => ({ ...current, [suggestion.domain]: { status: 'loading', candidates: [] } }));
      try {
        const response = await fetch('/api/competitors/brands', { method: 'POST', headers, body: JSON.stringify({ domain: suggestion.domain }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Lookup failed');
        setLookups(current => ({ ...current, [suggestion.domain]: { status: 'done', candidates: data.candidates || [] } }));
      } catch (cause) {
        setLookups(current => ({ ...current, [suggestion.domain]: { status: 'error', candidates: [], error: cause instanceof Error ? cause.message : 'Lookup failed' } }));
      }
    }
    setLookingUp(false);
  }

  async function lookupDomain() {
    setLookingUp(true); setError(''); setCandidates([]);
    try {
      const response = await fetch('/api/competitors/brands', { method: 'POST', headers, body: JSON.stringify({ domain: domain.trim().toLowerCase() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Brand lookup failed');
      setCandidates(data.candidates || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Brand lookup failed'); }
    finally { setLookingUp(false); }
  }

  async function search(after?: string) {
    setBusy(true);
    setError('');
    if (!after) { setResult(null); setSelected([]); setAnalysis(null); }
    try {
      const response = await fetch('/api/competitors/search', {
        method: 'POST', headers,
        body: JSON.stringify({ source, clientId, brandIds: source === 'foreplay' ? competitors.map(item => item.id) : [], searchTerms: terms.trim(), pageIds: source === 'meta' ? pageIds.split(',').map(value => value.trim()).filter(Boolean) : [], country, activeStatus, searchType, mediaType, ...(platform ? { platform } : {}), ...(after ? { after } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Search failed');
      setResult(previous => after && previous ? { ...data, ads: [...previous.ads, ...data.ads] } : data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Search failed'); }
    finally { setBusy(false); }
  }

  async function analyzeSelected() {
    if (!result || !skillName || !selected.length) return;
    setAnalyzing(true); setError(''); setAnalysis(null);
    try {
      const ads = result.ads.filter(ad => selected.includes(ad.id));
      const response = await fetch('/api/competitors/analyze', {
        method: 'POST', headers,
        body: JSON.stringify({ source, skillName, terms, country, ads }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Analysis failed');
      setAnalysis(data.analysis as Analysis);
      setAnalysisSkill(data.skill.name);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Analysis failed'); }
    finally { setAnalyzing(false); }
  }

  function toggleAd(id: string) {
    setSelected(current => current.includes(id) ? current.filter(item => item !== id) : current.length >= 12 ? current : [...current, id]);
  }

  const manualLibraryUrl = `https://www.facebook.com/ads/library/?active_status=${activeStatus.toLowerCase()}&ad_type=all&country=${country}&q=${encodeURIComponent(terms)}`;
  const noCommercialCoverage = !['GB', 'IE', 'FR', 'DE', 'ES', 'IT', 'NL', 'BE', 'AT', 'DK', 'FI', 'GR', 'PT', 'SE', 'PL', 'RO', 'CZ', 'HU', 'BG', 'HR', 'SK', 'SI', 'LT', 'LV', 'EE', 'CY', 'LU', 'MT'].includes(country);

  return <main className="competitor-shell craft-shell">
    <aside className={`craft-sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Main navigation">
      <a className="craft-brand" href="/"><span className="craft-brand-mark">T<span>.</span></span><strong>Tossdown</strong></a>
      <div className="craft-side-group"><p>WORKSPACE</p><a href="/"><span aria-hidden="true">⌂</span> Home</a><a href="/workbench"><span aria-hidden="true">▤</span> Account audits</a><a className="active" href="/competitors" aria-current="page"><span aria-hidden="true">↻</span><span>Competitor research<small>Find and study public ads</small></span></a><a href="/registry"><span aria-hidden="true">▦</span> Skills registry</a></div>
      <div className="craft-side-foot"><span className="craft-side-avatar">T</span><span><strong>Tossdown Ads</strong><small>Research workspace</small></span></div>
    </aside>
    {sidebarOpen && <button className="craft-sidebar-scrim" type="button" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <div className="craft-page">
      <nav className="craft-topbar" aria-label="Workspace toolbar"><button className="craft-menu" type="button" aria-label="Toggle navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(open => !open)}>☰</button><div className="craft-brand-search"><span aria-hidden="true">⌕</span><input aria-label="Jump to client brand" value={brandQuery} onChange={event => setBrandQuery(event.target.value)} placeholder="Jump to a client brand..." />{brandQuery && <div className="craft-search-results">{clientCatalog.filter(item => `${item.name} ${item.market}`.toLowerCase().includes(brandQuery.toLowerCase())).map(item => <button key={item.id} type="button" onClick={() => { setClientId(item.id); setBrandQuery(''); }}>{item.name}<small>{item.market}</small></button>)}{!clientCatalog.some(item => `${item.name} ${item.market}`.toLowerCase().includes(brandQuery.toLowerCase())) && <p>No matching client brand</p>}</div>}</div><div className="craft-top-status"><span className={`status-light ${sources.foreplay?.signedIn ? '' : 'pending'}`} /><span>{sources.foreplay?.signedIn ? 'Research connected' : 'Research access pending'}</span></div></nav>
      <div className="craft-content">
        <div className="craft-page-actions"><a href="/">← &nbsp; Workspace home</a><div className="craft-page-tabs"><a className="active" href="/competitors">✦ &nbsp; Research</a><a href="/workbench">◎ &nbsp; Audits</a><a href="/registry">▤ &nbsp; Skills</a></div></div>
        <header className="craft-hero"><p className="craft-crumb">CREATE / COMPETITOR RESEARCH</p><div className="craft-hero-main"><span className="craft-hero-icon" aria-hidden="true">ϟ</span><div><h1>Research competitor ads</h1><p>Choose where to look, select the right advertisers, then study their ads.</p></div></div><ol className="craft-steps" aria-label="Research steps"><li className="active"><span>1</span> Competitors &amp; source</li><li className={result ? 'active' : ''}><span>2</span> Competitor ads</li><li className={analysis ? 'active' : ''}><span>3</span> Analysis</li></ol></header>

        <div className="craft-body-grid"><section className="research-form">
      <div className="craft-section-title"><span className="craft-section-number">1</span><div><h2>Where to look</h2><p>Select the ad library for this research.</p></div></div>
      <div className="source-picker"><button type="button" className={source === 'foreplay' ? 'active' : ''} aria-pressed={source === 'foreplay'} onClick={() => { setSource('foreplay'); setResult(null); setAnalysis(null); }}><span className="craft-source-icon">F</span><span><strong>Foreplay</strong><small>Brand ad library</small></span><span className="craft-source-check" aria-hidden="true">✓</span></button><button type="button" className={source === 'meta' ? 'active' : ''} aria-pressed={source === 'meta'} onClick={() => { setSource('meta'); setResult(null); setAnalysis(null); }}><span className="craft-source-icon meta">M</span><span><strong>Meta Ad Library</strong><small>Public API</small></span><span className="craft-source-check" aria-hidden="true">✓</span></button></div>
      {source === 'foreplay' && !sources.foreplay?.ready && <div className="source-setup"><strong>{!sources.foreplay?.authConfigured ? 'Google sign-in needs setup' : !sources.foreplay?.signedIn ? 'Sign in to use Foreplay' : 'Foreplay API key is missing'}</strong><span>{!sources.foreplay?.authConfigured ? 'Add the Google OAuth client ID and secret, NEXTAUTH_URL, NEXTAUTH_SECRET, and AUTH_ALLOWED_EMAILS in Vercel. Then redeploy.' : !sources.foreplay?.signedIn ? 'Use an approved Google account to review and save advertiser matches. The Foreplay key stays on the server.' : 'Add FOREPLAY_API_KEY to the Vercel project and redeploy.'}</span>{sources.foreplay?.authConfigured && !sources.foreplay?.signedIn && <button type="button" className="secondary-button" onClick={() => void signIn('google', { callbackUrl: '/competitors' })}>Sign in with Google</button>}</div>}
      {source === 'foreplay' && sources.foreplay?.signedIn && <div className="signed-in-note"><span className="status-light" /> Signed in for paid research <button type="button" onClick={() => void signOut({ callbackUrl: '/competitors' })}>Sign out</button></div>}
      {source === 'meta' && !sources.meta?.configured && <div className="source-setup"><strong>Meta Ad Library API is not connected yet.</strong><span>Add <code>META_AD_LIBRARY_TOKEN</code> in Vercel after enabling API access for the Tossdown Meta developer app. Keep it server-side.</span><a href="https://www.facebook.com/ads/library/api/" target="_blank" rel="noreferrer">Open Meta API access steps ↗</a></div>}
      {source === 'foreplay' && <div className="competitor-setup">
        <div className="setup-title"><div><span className="craft-section-number">2</span><div><h3>Competitors</h3><p>Pick a client brand and review its suggested advertisers.</p></div></div><a href={clientBrand.evidence} target="_blank" rel="noreferrer">Brand source ↗</a></div>
        <label className="field client-picker"><span>Client brand</span><select value={clientId} onChange={event => { setClientId(event.target.value); setDomain(''); }}>{clientCatalog.map(item => <option key={item.id} value={item.id}>{item.name} · {item.market}</option>)}</select></label>
        <div className="lookup-head"><div><h4>Suggested competitors</h4><p>Check each Foreplay advertiser match before adding it.</p>{competitors.length + legacyMatches.length >= 10 && <p className="capacity-note">Review or discard earlier selections to free a slot.</p>}</div><button type="button" className="secondary-button lookup-all" disabled={!sources.foreplay?.ready || lookingUp || competitors.length + legacyMatches.length >= 10} onClick={() => void lookupSuggested()}>{lookingUp ? 'Looking up…' : 'Find all 4 in Foreplay'}</button></div>
        <div className="suggestion-list">{clientBrand.competitors.map(suggestion => {
          const lookup = lookups[suggestion.domain];
          return <article className="suggestion-card" key={suggestion.domain}>
            <div className="suggestion-identity"><span className="brand-avatar">{suggestion.name.slice(0, 1)}</span><div><strong>{suggestion.name}</strong><small>{suggestion.domain}</small></div></div>
            <div className="suggestion-detail"><a href={suggestion.evidence} target="_blank" rel="noreferrer">Why included ↗</a>
              {lookup?.status === 'loading' && <span className="lookup-status">Checking Foreplay…</span>}
              {lookup?.status === 'error' && <span className="lookup-error">{lookup.error}</span>}
              {lookup?.status === 'done' && !lookup.candidates.length && <span className="lookup-status">No domain match found</span>}
              {lookup?.candidates.map(candidate => <div className="match-row" key={candidate.id}><span><strong>{candidate.name}</strong><small>{candidate.website || 'Website not listed'} · ID {candidate.id}</small></span><button type="button" className="match-button" disabled={saving || competitors.some(item => item.id === candidate.id) || competitors.length + legacyMatches.length >= 10} onClick={() => void saveCompetitors([...competitors, { ...candidate, reviewed: true }])}>{competitors.some(item => item.id === candidate.id) ? 'Added' : 'Add advertiser'}</button></div>)}
            </div>
          </article>;
        })}</div>
        <div className="domain-row"><label className="field"><span>Look up another website</span><input value={domain} onChange={event => setDomain(event.target.value)} placeholder="competitor.com" /></label><button type="button" className="secondary-button" disabled={!sources.foreplay?.ready || !domain.trim() || lookingUp || competitors.length + legacyMatches.length >= 10} onClick={() => void lookupDomain()}>Look up</button></div>
        {candidates.length > 0 && <div className="candidate-list"><strong>Review domain results</strong>{candidates.map(candidate => <div className="match-row" key={candidate.id}><span><strong>{candidate.name}</strong><small>{candidate.website || 'Website not listed'} · ID {candidate.id}</small></span><button type="button" className="match-button" disabled={saving || competitors.some(item => item.id === candidate.id) || competitors.length + legacyMatches.length >= 10} onClick={() => { void saveCompetitors([...competitors, { ...candidate, reviewed: true }]); setCandidates([]); setDomain(''); }}>{competitors.some(item => item.id === candidate.id) ? 'Added' : 'Add advertiser'}</button></div>)}</div>}
        <div className="confirmed-head"><div><h4>Selected advertisers <span>{competitors.length}</span></h4></div>{legacyMatches.length > 0 && <p className="review-warning">{legacyMatches.length} older selections need review and are excluded from searches.</p>}</div>
        <div className="selected-brands">{competitors.map(item => <div className="selected-brand" key={item.id}><span><strong>{item.name}</strong><small>{item.domain}</small></span><button type="button" disabled={saving} aria-label={`Remove ${item.name}`} onClick={() => void saveCompetitors(competitors.filter(brand => brand.id !== item.id))}>Remove</button></div>)}{!competitors.length && <p className="selection-empty">No advertisers selected. Look up a website and add the correct match.</p>}</div>
        {legacyMatches.length > 0 && <details className="legacy-review"><summary>Review {legacyMatches.length} earlier selections</summary><p>These were saved before the lookup was tightened. Keep only advertisers that clearly match the intended competitor. Reviewing them uses no lookup credits.</p><div className="legacy-list">{legacyMatches.map(item => <div className="legacy-row" key={item.id}><div><strong>{item.name}</strong><small>{item.domain} · {item.website || 'Website unlisted'} · ID {item.id}</small></div><div><button type="button" disabled={saving} onClick={() => void saveCompetitors([...competitors, { ...item, reviewed: true }], legacyMatches.filter(old => old.id !== item.id))}>Keep</button><button type="button" disabled={saving} onClick={() => void saveCompetitors(competitors, legacyMatches.filter(old => old.id !== item.id))}>Discard</button></div></div>)}</div></details>}
      </div>}
      <div className="craft-section-title craft-filter-title"><span className="craft-section-number">3</span><div><h2>How many, and what about</h2><p>Set the search filters for this run.</p></div></div>
      <form id="competitor-search-form" onSubmit={event => { event.preventDefault(); void search(); }}>
        {source === 'meta' && <label className="field wide"><span>Brand, product, or ad-text search</span><input maxLength={100} value={terms} onChange={event => setTerms(event.target.value)} placeholder="e.g. meal delivery, franchise opportunities" /><small>Meta searches ad text; use Page IDs for advertiser-specific matching.</small></label>}
        {source === 'meta' && <label className="field wide"><span>Facebook Page IDs <small>(optional, up to 10)</small></span><input value={pageIds} onChange={event => setPageIds(event.target.value)} placeholder="Comma-separated Page IDs" /></label>}
        {source === 'meta' && <label className="field"><span>Country where ads ran</span><select value={country} onChange={event => setCountry(event.target.value)}>{countries.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>}
        <label className="field"><span>Delivery status</span><select value={activeStatus} onChange={event => setActiveStatus(event.target.value)}><option value="ACTIVE">Currently active</option><option value="ALL">All available</option><option value="INACTIVE">Inactive</option></select></label>
        {source === 'meta' && <label className="field"><span>Search match</span><select value={searchType} onChange={event => setSearchType(event.target.value)}><option value="KEYWORD_UNORDERED">Keywords in any order</option><option value="KEYWORD_EXACT_PHRASE">Exact phrase</option></select></label>}
        <label className="field"><span>Creative format</span><select value={mediaType} onChange={event => setMediaType(event.target.value)}><option value="ALL">All formats</option><option value="VIDEO">Video</option><option value="IMAGE">Image</option>{source === 'meta' && <option value="MEME">Meme</option>}</select></label>
        <label className="field"><span>Platform</span><select value={platform} onChange={event => setPlatform(event.target.value)}><option value="">All Meta platforms</option><option value="FACEBOOK">Facebook</option><option value="INSTAGRAM">Instagram</option><option value="MESSENGER">Messenger</option>{source === 'meta' && <><option value="WHATSAPP">WhatsApp</option><option value="THREADS">Threads</option></>}</select></label>
      </form>
      {source === 'meta' && noCommercialCoverage && <p className="coverage-warning"><strong>Coverage note for {countries.find(([code]) => code === country)?.[1]}:</strong> Meta’s API generally does not return ordinary commercial ads delivered only outside the UK/EU. You can still browse Meta’s public Ad Library manually for this market.</p>}
    </section><aside className="craft-summary"><p className="craft-summary-kicker">THIS SEARCH</p><dl><div><dt>Source</dt><dd>{source === 'foreplay' ? 'Foreplay' : 'Meta Library'}</dd></div><div><dt>{source === 'foreplay' ? 'Advertisers' : 'Page IDs'}</dt><dd>{source === 'foreplay' ? competitors.length : pageIds.split(',').filter(value => value.trim()).length}</dd></div><div><dt>Ads per page</dt><dd>{source === 'foreplay' ? 20 : 50}</dd></div><div><dt>Filters</dt><dd>{[activeStatus !== 'ALL', mediaType !== 'ALL', !!platform, source === 'meta' && !!terms.trim()].filter(Boolean).length}</dd></div></dl><div className="craft-up-to"><span>Up to</span><strong>{source === 'foreplay' ? 20 : 50} ads</strong><small>per page</small></div><button className="craft-search-button" type="submit" form="competitor-search-form" disabled={busy || (source === 'foreplay' && (!sources.foreplay?.ready || !competitors.length)) || (source === 'meta' && !terms.trim() && !pageIds.trim())}>{busy ? 'Fetching…' : source === 'foreplay' ? 'View competitor ads →' : 'Search ad library →'}</button><p className="craft-summary-foot">{source === 'foreplay' ? 'One Foreplay credit per returned ad.' : 'Searches public Meta ad records.'}</p></aside></div>

    {error && <div className="error">{error}</div>}

    {result && <section className="ad-results">
      <div className="ad-results-head"><div><p className="section-kicker">02 / CREATIVE LIBRARY</p><h2>{result.ads.length} ads found</h2><small>From {result.source} · Updated {new Date(result.retrievedAt).toLocaleString()}</small></div><div className="result-actions"><label className="field compact"><span>Analysis skill</span><select value={skillName} onChange={event => setSkillName(event.target.value)}><option value="">Choose approved skill</option>{skills.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label><button className="secondary-button" onClick={() => void analyzeSelected()} disabled={!selected.length || !skillName || analyzing}>{analyzing ? 'Analyzing…' : `Analyze ${selected.length || ''} selected`}</button></div></div>
      <p className="coverage-note">{result.coverageNote}</p>
      {!skills.length && <p className="empty">No approved competitor skill yet. Sync sources and approve a competitor-intelligence skill in the <a href="/registry">skills registry</a>.</p>}
      {!result.ads.length && <p className="empty">No ads were returned for this search. Adjust the filters and check the source’s coverage.</p>}
      <div className="ad-grid">{result.ads.map(ad => <article className="ad-card" key={ad.id}>
        <div className="ad-card-main"><div className="ad-media">{ad.thumbnail_url ? <img className="ad-thumbnail" src={ad.thumbnail_url} alt="Competitor ad thumbnail" loading="lazy" /> : <span>CREATIVE PREVIEW<br />UNAVAILABLE</span>}</div>
          <div className="ad-card-body"><div className="ad-card-top"><label className="select-ad"><input type="checkbox" checked={selected.includes(ad.id)} disabled={!selected.includes(ad.id) && selected.length >= 12} onChange={() => toggleAd(ad.id)} /><span>Select for analysis</span></label></div><p className="section-kicker">{ad.page_name || 'Unknown advertiser'}</p><h3>{ad.ad_creative_link_titles?.[0] || ad.page_name || 'Ad creative'}</h3><p className="ad-copy">{ad.ad_creative_bodies?.[0] || 'No primary text supplied by this source.'}</p>
          {(ad.ad_creative_link_descriptions?.[0] || ad.ad_creative_link_captions?.[0]) && <p className="ad-description">{ad.ad_creative_link_descriptions?.[0] || ad.ad_creative_link_captions?.[0]}</p>}</div></div>
        <div className="ad-card-foot"><div className="ad-meta">{ad.publisher_platforms?.slice(0, 3).map(item => <span key={item}>{item.replaceAll('_', ' ')}</span>)}{ad.ad_delivery_start_time && <span>Since {ad.ad_delivery_start_time.slice(0, 10)}</span>}</div>{(ad.ad_snapshot_url || source === 'meta') && <a className="ad-source-link" href={ad.ad_snapshot_url || `https://www.facebook.com/ads/library/?id=${encodeURIComponent(ad.id)}`} target="_blank" rel="noreferrer">View source ↗</a>}</div>
      </article>)}</div>
      {result.after && <button className="secondary-button load-more" onClick={() => void search(result.after!)} disabled={busy}>{busy ? 'Loading…' : 'Load more ads'}</button>}
      <p className="data-caveat">Ad-library presence, active state, and delivery duration are observed source fields, not evidence that a competitor’s ad is profitable or effective.</p>
    </section>}

    {analysis && <section className="analysis-panel"><p className="eyebrow">SKILL ANALYSIS · {analysisSkill}</p>{analysis.status === 'complete' ? <><h2>{analysis.summary}</h2>{analysis.findings?.map((item, index) => <article className="finding" key={`${item.title}-${index}`}><strong>{item.title}</strong><p>{item.evidence}</p><small>Next step: {item.recommendation}</small></article>)}{!!analysis.dataGaps?.length && <p className="data-caveat">Data gaps: {analysis.dataGaps.join(' · ')}</p>}</> : <p className="empty">{analysis.message || 'Analysis unavailable.'}</p>}</section>}

    <section className="provider-next"><div><p className="section-kicker">ABOUT THIS SOURCE</p><p>Foreplay lists indexed ads, with no delivery-country filter or spend data. Verify creative and dates in each original record.</p></div><a href="/">Back to workspace ↗</a></section>
      </div>
    </div>
  </main>;
}
