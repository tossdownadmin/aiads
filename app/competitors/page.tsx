'use client';

import { useEffect, useMemo, useState } from 'react';

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
type BrandCandidate = { id: string; name: string; domain: string; website?: string };
type Analysis = { status: 'complete' | 'not_configured' | 'unavailable'; summary?: string; findings?: Array<{ title: string; severity: string; evidence: string; recommendation: string }>; dataGaps?: string[]; message?: string };

const countries = [
  ['CA', 'Canada'], ['US', 'United States'], ['GB', 'United Kingdom'], ['IE', 'Ireland'],
  ['FR', 'France'], ['DE', 'Germany'], ['ES', 'Spain'], ['IT', 'Italy'], ['NL', 'Netherlands'],
  ['PK', 'Pakistan'], ['AE', 'United Arab Emirates'], ['AU', 'Australia'], ['IN', 'India'],
];

export default function CompetitorResearch() {
  const [sources, setSources] = useState<Record<string, { configured: boolean; ready: boolean }>>({});
  const [source, setSource] = useState<'meta' | 'foreplay'>('foreplay');
  const [brandName, setBrandName] = useState('Tossdown');
  const [domain, setDomain] = useState('');
  const [candidates, setCandidates] = useState<BrandCandidate[]>([]);
  const [competitors, setCompetitors] = useState<BrandCandidate[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
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
    try {
      const saved = JSON.parse(localStorage.getItem(`aiads:competitors:${brandName.trim().toLowerCase()}`) || '[]');
      setCompetitors(Array.isArray(saved) ? saved.filter((item: BrandCandidate) => item && typeof item.id === 'string').slice(0, 10) : []);
    } catch { setCompetitors([]); }
  }, [brandName]);

  function saveCompetitors(next: BrandCandidate[]) {
    setCompetitors(next);
    localStorage.setItem(`aiads:competitors:${brandName.trim().toLowerCase()}`, JSON.stringify(next));
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
        body: JSON.stringify({ source, brandIds: source === 'foreplay' ? competitors.map(item => item.id) : [], searchTerms: terms.trim(), pageIds: source === 'meta' ? pageIds.split(',').map(value => value.trim()).filter(Boolean) : [], country, activeStatus, searchType, mediaType, ...(platform ? { platform } : {}), ...(after ? { after } : {}) }),
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

  return <main className="competitor-shell">
    <nav className="product-nav">
      <a className="product-brand" href="/"><span className="mark">T</span><span><strong>Tossdown</strong><small>ADS INTELLIGENCE</small></span></a>
      <div className="product-links"><a href="/workbench">Account audits</a><a className="active" href="/competitors">Competitor research</a><a href="/registry">Skills registry</a></div>
    </nav>

    <header className="competitor-heading">
      <p className="eyebrow">COMPETITOR INTELLIGENCE</p>
      <h1>Research the ads your market is seeing.</h1>
      <p>Search public ad-library records, inspect the creative, then ask an approved skill to identify patterns. Competitor records do not expose ordinary spend or conversion results.</p>
    </header>

    <section className="research-form">
      <div className="research-form-head"><div><span className="number-dot">01</span><div><h2>Find competitor ads</h2><p>Choose a source and what to look for.</p></div></div><span className="source-chip">{source === 'foreplay' ? 'FOREPLAY BRAND ADS' : 'META AD LIBRARY API'}</span></div>
      <div className="source-picker"><button type="button" className={source === 'foreplay' ? 'active' : ''} onClick={() => { setSource('foreplay'); setResult(null); setAnalysis(null); }}>Foreplay Brand Ads</button><button type="button" className={source === 'meta' ? 'active' : ''} onClick={() => { setSource('meta'); setResult(null); setAnalysis(null); }}>Meta Ad Library API</button></div>
      {source === 'foreplay' && <div className="source-setup"><strong>Foreplay connection is staged.</strong><span>Foreplay’s terms require authenticated users. Paid search is paused while this app has no sign-in. After that is resolved, add <code>FOREPLAY_API_KEY</code> in Vercel. The brand ads endpoint does not offer a delivery-country filter.</span><a href="https://www.foreplay.co/page/api-terms" target="_blank" rel="noreferrer">Foreplay API terms ↗</a></div>}
      {source === 'meta' && !sources.meta?.configured && <div className="source-setup"><strong>Meta Ad Library API is not connected yet.</strong><span>Add <code>META_AD_LIBRARY_TOKEN</code> in Vercel after enabling API access for the Tossdown Meta developer app. Keep it server-side.</span><a href="https://www.facebook.com/ads/library/api/" target="_blank" rel="noreferrer">Open Meta API access steps ↗</a></div>}
      {source === 'foreplay' && <div className="competitor-setup"><h3>Competitors for this brand</h3><p>Keep a reviewed list of up to 10 competitors. Enter each website domain, check Foreplay’s matching brand, then add it to the list. This draft list is saved in this browser.</p><label className="field"><span>Your brand</span><input value={brandName} onChange={event => setBrandName(event.target.value)} placeholder="Client brand name" /></label><div className="domain-row"><label className="field"><span>Competitor website</span><input value={domain} onChange={event => setDomain(event.target.value)} placeholder="competitor.com" /></label><button type="button" className="secondary-button" disabled={!sources.foreplay?.ready || !domain.trim() || lookingUp || competitors.length >= 10} onClick={() => void lookupDomain()}>{lookingUp ? 'Looking up…' : 'Find brand'}</button></div>{candidates.length > 0 && <div className="candidate-list"><strong>Confirm the matching advertiser</strong>{candidates.map(candidate => <button type="button" key={candidate.id} disabled={competitors.some(item => item.id === candidate.id) || competitors.length >= 10} onClick={() => { saveCompetitors([...competitors, candidate]); setCandidates([]); setDomain(''); }}>{candidate.name} · {candidate.domain} <small>Brand ID {candidate.id}</small></button>)}</div>}<div className="selected-brands">{competitors.map(item => <span key={item.id}>{item.name} <small>{item.domain}</small><button type="button" aria-label={`Remove ${item.name}`} onClick={() => saveCompetitors(competitors.filter(brand => brand.id !== item.id))}>×</button></span>)}{!competitors.length && <small>No competitors added yet.</small>}</div></div>}
      <form onSubmit={event => { event.preventDefault(); void search(); }}>
        {source === 'meta' && <label className="field wide"><span>Brand, product, or ad-text search</span><input maxLength={100} value={terms} onChange={event => setTerms(event.target.value)} placeholder="e.g. meal delivery, franchise opportunities" /><small>Meta searches ad text; use Page IDs for advertiser-specific matching.</small></label>}
        {source === 'meta' && <label className="field wide"><span>Facebook Page IDs <small>(optional, up to 10)</small></span><input value={pageIds} onChange={event => setPageIds(event.target.value)} placeholder="Comma-separated Page IDs" /></label>}
        {source === 'meta' && <label className="field"><span>Country where ads ran</span><select value={country} onChange={event => setCountry(event.target.value)}>{countries.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>}
        <label className="field"><span>Delivery status</span><select value={activeStatus} onChange={event => setActiveStatus(event.target.value)}><option value="ACTIVE">Currently active</option><option value="ALL">All available</option><option value="INACTIVE">Inactive</option></select></label>
        {source === 'meta' && <label className="field"><span>Search match</span><select value={searchType} onChange={event => setSearchType(event.target.value)}><option value="KEYWORD_UNORDERED">Keywords in any order</option><option value="KEYWORD_EXACT_PHRASE">Exact phrase</option></select></label>}
        <label className="field"><span>Creative format</span><select value={mediaType} onChange={event => setMediaType(event.target.value)}><option value="ALL">All formats</option><option value="VIDEO">Video</option><option value="IMAGE">Image</option>{source === 'meta' && <option value="MEME">Meme</option>}</select></label>
        <label className="field"><span>Platform</span><select value={platform} onChange={event => setPlatform(event.target.value)}><option value="">All Meta platforms</option><option value="FACEBOOK">Facebook</option><option value="INSTAGRAM">Instagram</option><option value="MESSENGER">Messenger</option>{source === 'meta' && <><option value="WHATSAPP">WhatsApp</option><option value="THREADS">Threads</option></>}</select></label>
        <div className="search-actions"><button className="run-button" type="submit" disabled={busy || (source === 'foreplay' && (!sources.foreplay?.ready || !competitors.length)) || (source === 'meta' && !terms.trim() && !pageIds.trim())}>{busy ? 'Fetching…' : source === 'foreplay' ? 'Fetch competitor ads →' : 'Search ad library →'}</button><span>Up to {source === 'foreplay' ? 20 : 50} records per page{source === 'foreplay' ? ' · one credit per ad' : ''}</span></div>
      </form>
      {source === 'meta' && noCommercialCoverage && <p className="coverage-warning"><strong>Coverage note for {countries.find(([code]) => code === country)?.[1]}:</strong> Meta’s API generally does not return ordinary commercial ads delivered only outside the UK/EU. You can still browse Meta’s public Ad Library manually for this market.</p>}
    </section>

    {error && <div className="error">{error}</div>}

    {result && <section className="ad-results">
      <div className="ad-results-head"><div><p className="eyebrow">SEARCH RESULTS · {result.source}</p><h2>{result.ads.length} ads returned</h2><small>Retrieved {new Date(result.retrievedAt).toLocaleString()}</small></div><div className="result-actions"><label className="field compact"><span>Analysis skill</span><select value={skillName} onChange={event => setSkillName(event.target.value)}><option value="">Choose approved skill</option>{skills.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label><button className="secondary-button" onClick={() => void analyzeSelected()} disabled={!selected.length || !skillName || analyzing}>{analyzing ? 'Analyzing…' : `Analyze ${selected.length || ''} selected`}</button></div></div>
      <p className="coverage-note">{result.coverageNote}</p>
      {!skills.length && <p className="empty">No approved competitor skill yet. Sync sources and approve a competitor-intelligence skill in the <a href="/registry">skills registry</a>.</p>}
      {!result.ads.length && <p className="empty">No ads were returned for this search. Adjust the filters and check the source’s coverage.</p>}
      <div className="ad-grid">{result.ads.map(ad => <article className="ad-card" key={ad.id}>
        <div className="ad-card-top"><label className="select-ad"><input type="checkbox" checked={selected.includes(ad.id)} disabled={!selected.includes(ad.id) && selected.length >= 12} onChange={() => toggleAd(ad.id)} /><span>Select</span></label><span className="record-id">AD ID {ad.id}</span></div>
        {ad.thumbnail_url && <img className="ad-thumbnail" src={ad.thumbnail_url} alt="Competitor ad thumbnail" loading="lazy" />}
        <div className="ad-card-body"><p className="eyebrow">ADVERTISER</p><h3>{ad.page_name || 'Unknown Page'}</h3><p className="ad-copy">{ad.ad_creative_bodies?.[0] || 'No primary text available in this result.'}</p>
          {(ad.ad_creative_link_titles?.[0] || ad.ad_creative_link_descriptions?.[0] || ad.ad_creative_link_captions?.[0]) && <div className="ad-link-preview">{ad.ad_creative_link_titles?.[0] && <strong>{ad.ad_creative_link_titles[0]}</strong>}{ad.ad_creative_link_descriptions?.[0] && <span>{ad.ad_creative_link_descriptions[0]}</span>}{ad.ad_creative_link_captions?.[0] && <small>{ad.ad_creative_link_captions[0]}</small>}</div>}
        </div>
        <div className="ad-meta">{ad.publisher_platforms?.map(item => <span key={item}>{item}</span>)}{ad.ad_delivery_start_time && <span>Started {ad.ad_delivery_start_time.slice(0, 10)}</span>}{ad.ad_delivery_stop_time && <span>Stopped {ad.ad_delivery_stop_time.slice(0, 10)}</span>}</div>
        {(ad.ad_snapshot_url || source === 'meta') && <a className="ad-source-link" href={ad.ad_snapshot_url || `https://www.facebook.com/ads/library/?id=${encodeURIComponent(ad.id)}`} target="_blank" rel="noreferrer">Open original ad record ↗</a>}
      </article>)}</div>
      {result.after && <button className="secondary-button load-more" onClick={() => void search(result.after!)} disabled={busy}>{busy ? 'Loading…' : 'Load more ads'}</button>}
      <p className="data-caveat">Ad-library presence, active state, and delivery duration are observed source fields, not evidence that a competitor’s ad is profitable or effective.</p>
    </section>}

    {analysis && <section className="analysis-panel"><p className="eyebrow">SKILL ANALYSIS · {analysisSkill}</p>{analysis.status === 'complete' ? <><h2>{analysis.summary}</h2>{analysis.findings?.map((item, index) => <article className="finding" key={`${item.title}-${index}`}><strong>{item.title}</strong><p>{item.evidence}</p><small>Next step: {item.recommendation}</small></article>)}{!!analysis.dataGaps?.length && <p className="data-caveat">Data gaps: {analysis.dataGaps.join(' · ')}</p>}</> : <p className="empty">{analysis.message || 'Analysis unavailable.'}</p>}</section>}

    <section className="provider-next"><div><p className="eyebrow">SOURCE COVERAGE</p><h2>Research with clear source boundaries.</h2><p>Foreplay Brand Ads returns indexed ads for confirmed advertisers without a delivery-country filter. Meta’s official API has limited commercial coverage outside the UK/EU. Check each original record before drawing market conclusions.</p></div><a href="/">Back to workspace</a></section>
  </main>;
}
