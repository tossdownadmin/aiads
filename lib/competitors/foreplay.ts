type ForeplayAd = Record<string, unknown>;

export type ForeplaySearch = {
  brandIds: string[];
  live: 'ACTIVE' | 'INACTIVE' | 'ALL';
  format: 'ALL' | 'IMAGE' | 'VIDEO';
  platform?: 'FACEBOOK' | 'INSTAGRAM' | 'MESSENGER' | 'AUDIENCE_NETWORK';
  cursor?: string;
};

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function publicUrl(value: unknown, host?: string): string | undefined {
  const raw = string(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || (host && url.hostname !== host)) return undefined;
    return url.toString();
  } catch { return undefined; }
}

export async function searchForeplay(input: ForeplaySearch) {
  const key = process.env.FOREPLAY_API_KEY;
  if (!key) throw new Error('Foreplay API key is not configured');
  const url = new URL('https://public.api.foreplay.co/api/brand/getAdsByBrandId');
  input.brandIds.forEach(id => url.searchParams.append('brand_ids', id));
  url.searchParams.set('limit', '20');
  url.searchParams.set('order', 'newest');
  if (input.live !== 'ALL') url.searchParams.set('live', String(input.live === 'ACTIVE'));
  if (input.format !== 'ALL') url.searchParams.set('display_format', input.format.toLowerCase());
  if (input.platform) url.searchParams.set('publisher_platform', input.platform.toLowerCase());
  if (input.cursor) url.searchParams.set('cursor', input.cursor);

  const response = await fetch(url, { cache: 'no-store', headers: { Authorization: key } });
  const payload = await response.json().catch(() => ({})) as {
    data?: ForeplayAd[];
    metadata?: { cursor?: string; message?: string };
  };
  if (!response.ok) {
    const failure = new Error('Foreplay search failed') as Error & { httpStatus?: number };
    failure.httpStatus = response.status;
    throw failure;
  }
  const ads = Array.isArray(payload.data) ? payload.data.slice(0, 20).map(ad => {
    const brand = ad.brand && typeof ad.brand === 'object' ? ad.brand as ForeplayAd : {};
    const platforms = Array.isArray(ad.publisher_platform) ? ad.publisher_platform.map(String) : string(ad.publisher_platform) ? [String(ad.publisher_platform)] : [];
    const body = string(ad.description) || string(ad.headline);
    return {
      id: String(ad.id || ad.ad_id || ''),
      page_name: string(brand.name) || string(ad.brand_name) || string(ad.name),
      ad_creative_bodies: body ? [body] : [],
      ad_creative_link_titles: string(ad.headline) ? [String(ad.headline)] : [],
      ad_creative_link_descriptions: string(ad.cta_title) ? [String(ad.cta_title)] : [],
      publisher_platforms: platforms,
      ad_delivery_start_time: string(ad.started_running),
      ad_snapshot_url: publicUrl(ad.foreplay_url, 'app.foreplay.co'),
      thumbnail_url: publicUrl(ad.thumbnail),
      display_format: string(ad.display_format),
      live: typeof ad.live === 'boolean' ? ad.live : undefined,
    };
  }).filter(ad => ad.id) : [];
  return {
    ads,
    after: string(payload.metadata?.cursor) || null,
    source: 'Foreplay Brand Ads API' as const,
    retrievedAt: new Date().toISOString(),
    coverageNote: 'Foreplay returns ads indexed for the selected brands. Results are not filtered by delivery country; inspect each original ad and do not infer spend or performance.',
    creditCost: Number(response.headers.get('x-credit-cost') || ads.length),
    creditsRemaining: Number(response.headers.get('x-credits-remaining') || 0),
  };
}

export async function findForeplayBrandsByDomain(domain: string) {
  const key = process.env.FOREPLAY_API_KEY;
  if (!key) throw new Error('Foreplay API key is not configured');
  const url = new URL('https://public.api.foreplay.co/api/brand/getBrandsByDomain');
  url.searchParams.set('domain', domain);
  url.searchParams.set('limit', '5');
  const response = await fetch(url, { cache: 'no-store', headers: { Authorization: key } });
  const payload = await response.json().catch(() => ({})) as { data?: ForeplayAd[] };
  if (response.status === 404) return [];
  if (!response.ok) {
    const failure = new Error('Foreplay brand lookup failed') as Error & { httpStatus?: number };
    failure.httpStatus = response.status;
    throw failure;
  }
  return (Array.isArray(payload.data) ? payload.data : []).slice(0, 5).map(brand => ({
    id: String(brand.id || ''),
    name: string(brand.name) || 'Unnamed brand',
    domain,
    website: publicUrl(brand.url),
  })).filter(brand => brand.id);
}

export async function findForeplayBrandsByName(name: string, domain: string) {
  const key = process.env.FOREPLAY_API_KEY;
  if (!key) throw new Error('Foreplay API key is not configured');
  const url = new URL('https://public.api.foreplay.co/api/discovery/brands');
  url.searchParams.set('query', name);
  url.searchParams.set('limit', '5');
  const response = await fetch(url, { cache: 'no-store', headers: { Authorization: key } });
  const payload = await response.json().catch(() => ({})) as { data?: ForeplayAd[] };
  if (response.status === 404) return [];
  if (!response.ok) {
    const failure = new Error('Foreplay name lookup failed') as Error & { httpStatus?: number };
    failure.httpStatus = response.status;
    throw failure;
  }
  return (Array.isArray(payload.data) ? payload.data : []).slice(0, 5).map(brand => ({
    id: String(brand.id || ''),
    name: string(brand.name) || 'Unnamed brand',
    domain,
    website: publicUrl(brand.url),
    activeAdsCount: typeof brand.active_ads_count === 'number' ? brand.active_ads_count : undefined,
  })).filter(brand => brand.id);
}
