export type MetaLibraryAd = {
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
};

export type MetaLibrarySearch = {
  searchTerms: string;
  country: string;
  activeStatus: 'ACTIVE' | 'INACTIVE' | 'ALL';
  searchType: 'KEYWORD_UNORDERED' | 'KEYWORD_EXACT_PHRASE';
  mediaType?: 'ALL' | 'IMAGE' | 'VIDEO' | 'MEME' | 'NONE';
  platform?: string;
  pageIds?: string[];
  after?: string;
};

const FIELDS = [
  'id', 'page_id', 'page_name', 'ad_creation_time', 'ad_delivery_start_time',
  'ad_delivery_stop_time', 'ad_creative_bodies', 'ad_creative_link_titles',
  'ad_creative_link_descriptions', 'ad_creative_link_captions', 'ad_snapshot_url',
  'publisher_platforms',
].join(',');

function getToken() {
  const value = process.env.META_AD_LIBRARY_TOKEN;
  if (!value) throw new Error('META_AD_LIBRARY_TOKEN is not configured');
  return value;
}

export async function searchMetaAdLibrary(input: MetaLibrarySearch) {
  const version = process.env.META_API_VERSION || 'v27.0';
  const url = new URL(`https://graph.facebook.com/${version}/ads_archive`);
  url.searchParams.set('ad_reached_countries', JSON.stringify([input.country]));
  url.searchParams.set('ad_type', 'ALL');
  url.searchParams.set('ad_active_status', input.activeStatus);
  url.searchParams.set('fields', FIELDS);
  url.searchParams.set('limit', '50');
  if (input.searchTerms) url.searchParams.set('search_terms', input.searchTerms);
  if (input.searchTerms) url.searchParams.set('search_type', input.searchType);
  if (input.mediaType && input.mediaType !== 'ALL') url.searchParams.set('media_type', input.mediaType);
  if (input.platform) url.searchParams.set('publisher_platforms', JSON.stringify([input.platform]));
  if (input.pageIds?.length) url.searchParams.set('search_page_ids', JSON.stringify(input.pageIds));
  if (input.after) url.searchParams.set('after', input.after);

  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  const data = await response.json().catch(() => ({})) as {
    data?: MetaLibraryAd[];
    paging?: { cursors?: { after?: string } };
    error?: { message?: string; code?: number; error_subcode?: number };
  };
  if (!response.ok) {
    const error = new Error(data.error?.message || 'Meta Ad Library request failed') as Error & { providerCode?: number; providerSubcode?: number; httpStatus?: number };
    error.providerCode = data.error?.code;
    error.providerSubcode = data.error?.error_subcode;
    error.httpStatus = response.status;
    throw error;
  }

  return {
    ads: (data.data || []).map(ad => ({
      ...ad,
      ad_snapshot_url: safeSnapshotUrl(ad.ad_snapshot_url),
    })),
    after: data.paging?.cursors?.after || null,
    source: 'Meta Ad Library API' as const,
    retrievedAt: new Date().toISOString(),
  };
}

function safeSnapshotUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'facebook.com' || url.hostname.endsWith('.facebook.com')) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
