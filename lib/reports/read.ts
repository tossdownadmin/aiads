import { fetchAllPages, getCampaigns, type MetaAccount } from '../meta/read';
import { joinCampaigns, metrics, type Row, type DeliverySettings, type Snapshot, type Tracking, type Window } from './model';

const fields = 'spend,impressions,reach,frequency,clicks,ctr,cpc,actions,conversions,action_values,purchase_roas,video_thruplay_watched_actions';

export async function readReportWindows(account: MetaAccount, windows: Window[]): Promise<Snapshot[]> {
  const [inventory, adsets] = await Promise.all([
    getCampaigns(account.id).catch(() => null),
    fetchAllPages<{ campaign_id: string; optimization_goal?: string; bid_strategy?: string }>(account.id + '/adsets', {
      fields: 'campaign_id,optimization_goal,bid_strategy', limit: '500',
    }).catch(() => null),
  ]);
  const settings = new Map<string,DeliverySettings>();
  for (const set of adsets ?? []) {
    const item = settings.get(set.campaign_id) ?? { goals: [], bids: [] };
    if (set.optimization_goal && !item.goals.includes(set.optimization_goal)) item.goals.push(set.optimization_goal);
    if (set.bid_strategy && !item.bids.includes(set.bid_strategy)) item.bids.push(set.bid_strategy);
    settings.set(set.campaign_id, item);
  }
  return Promise.all(windows.map(async window => {
    const params = { time_range: JSON.stringify({ since: window.since, until: window.until }), use_unified_attribution_setting: 'true', limit: '200' };
    let limited = false;
    const readInsights = async (level: 'campaign' | 'account') => {
      const base = (level === 'campaign' ? 'campaign_id,campaign_name,objective,' : '') + fields;
      try {
        return await fetchAllPages<Row>(account.id + '/insights', { ...params, level, fields: base + ',instagram_profile_visits' });
      } catch (error) {
        if (!(error instanceof Error) || !/instagram_profile_visits|not a valid.*field|invalid metric/i.test(error.message)) throw error;
        limited = true;
        return fetchAllPages<Row>(account.id + '/insights', { ...params, level, fields: base });
      }
    };
    const [rows, accountRows] = await Promise.all([
      readInsights('campaign'), readInsights('account').catch(() => null),
    ]);
    const notes: string[] = [];
    if (limited) notes.push('Direct Instagram profile visits were unavailable for part of this report.');
    if (!adsets) notes.push('Current ad-set goals and bid settings were unavailable.');
    if (!inventory) notes.push('Campaign inventory was unavailable. Current statuses and active campaigns without insight rows could not be checked.');
    if (accountRows === null) notes.push('Account totals were unavailable. Campaign rows remain available.');
    if (accountRows && !accountRows.length) notes.push('Meta returned no account-level insight row for this period.');
    return { window, inventory: inventory ? { total: inventory.length, active: inventory.filter(c => c.effective_status === 'ACTIVE').length } : undefined, totals: accountRows?.[0] ? metrics(accountRows[0]) : null, campaigns: joinCampaigns(inventory ?? [], rows, window, settings), notes };
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

export async function readComparison(accountId:string,window:Window) {
  const rows=await fetchAllPages<Row>(accountId+'/insights',{level:'account',time_range:JSON.stringify(window),use_unified_attribution_setting:'true',fields:'spend,impressions,reach,frequency,clicks,ctr,cpc,actions,action_values,purchase_roas'});
  return {window,totals:rows[0]?metrics(rows[0]):null};
}
