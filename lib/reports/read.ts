import { fetchAllPages, getCampaigns, type MetaAccount } from '../meta/read';
import { joinCampaigns, metrics, type Row, type Snapshot, type Tracking, type Window } from './model';

const fields = 'spend,impressions,reach,frequency,clicks,ctr,cpc,actions,action_values,purchase_roas,video_thruplay_watched_actions';

export async function readReportWindows(account: MetaAccount, windows: Window[]): Promise<Snapshot[]> {
  const inventory = await getCampaigns(account.id).catch(() => null);
  return Promise.all(windows.map(async window => {
    const params = { time_range: JSON.stringify({ since: window.since, until: window.until }), use_unified_attribution_setting: 'true', limit: '200' };
    const [rows, accountRows] = await Promise.all([
      fetchAllPages<Row>(account.id + '/insights', { ...params, level: 'campaign', fields: 'campaign_id,campaign_name,objective,' + fields }),
      fetchAllPages<Row>(account.id + '/insights', { ...params, level: 'account', fields }).catch(() => null),
    ]);
    const notes: string[] = [];
    if (!inventory) notes.push('Campaign inventory was unavailable. Current statuses and active campaigns without insight rows could not be checked.');
    if (accountRows === null) notes.push('Account totals were unavailable. Campaign rows remain available.');
    if (accountRows && !accountRows.length) notes.push('Meta returned no account-level insight row for this period.');
    return { window, totals: accountRows?.[0] ? metrics(accountRows[0]) : null, campaigns: joinCampaigns(inventory ?? [], rows, window), notes };
  }));
}

export async function readTracking(accountId: string): Promise<Tracking> {
  const now = new Date();
  const start = new Date(now.getTime() - 7 * 86400000);
  const response: Tracking = { checkedAt: now.toISOString(), since: start.toISOString(), pixels: null };
  const pixels = await fetchAllPages<{ id: string; name?: string; last_fired_time?: string }>(accountId + '/adspixels', { fields: 'id,name,last_fired_time', limit: '100' }).catch(() => null);
  if (!pixels) return response;
  response.pixels = [];
  for (const pixel of pixels) {
    const rows = await fetchAllPages<{ data?: { count?: number; value?: string; event?: string }[] }>(pixel.id + '/stats', {
      aggregation: 'event_source', start_time: String(Math.floor(start.getTime()/1000)), end_time: String(Math.floor(now.getTime()/1000)), fields: 'aggregation,data,start_time', limit: '200',
    }).catch(() => null);
    const sources = new Set<string>();
    for (const bucket of rows ?? []) {
      for (const stat of bucket.data ?? []) {
        if (Number(stat.count) > 0 && stat.value) sources.add(String(stat.value).slice(0, 90));
      }
    }
    response.pixels.push({ name: pixel.name || pixel.id, lastFired: pixel.last_fired_time || null, sources: rows === null ? null : [...sources] });
  }
  return response;
}
