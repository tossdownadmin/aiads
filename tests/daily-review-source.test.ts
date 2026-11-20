import { beforeEach, expect, it, vi } from 'vitest';
import { readDetails } from '../lib/meta/campaign-detail';
import { previousWindow } from '../lib/reports/model';
import { readDailyReview } from '../lib/reports/read';

const api = vi.hoisted(() => ({ fetch: vi.fn(), campaigns: vi.fn(), graph: vi.fn() }));
vi.mock('../lib/meta/read', () => ({
  fetchAllPages: api.fetch,
  getCampaigns: api.campaigns,
  fetchGraph: api.graph,
}));

const account = { id: 'act_123', name: 'Test account', currency: 'CAD', status: 1 };
const window = { since: '2026-11-13', until: '2026-11-19' };
const previous = previousWindow(window);
const denied = () => Object.assign(Error('Permission denied'), { status: 403 });

beforeEach(() => {
  vi.resetAllMocks();
  api.campaigns.mockResolvedValue([]);
  api.graph.mockRejectedValue(Error('Unexpected creative lookup'));
});

it('retains daily-only historical ads when aggregate metrics are denied, without inventing period totals', async () => {
  api.fetch.mockImplementation(async (path, params) => {
    if (!path.endsWith('/insights')) return [];
    if (!params.time_increment) throw denied();
    return [
      { campaign_id: 'campaign', adset_id: 'set', ad_id: 'historical', date_start: window.since,
        spend: '10', impressions: '100', ctr: '2', cpc: '5', frequency: '1', clicks: '2' },
      { campaign_id: 'campaign', adset_id: 'set', ad_id: 'historical', date_start: window.until,
        spend: '0', impressions: '0', actions: [{ action_type: 'lead', value: '0' }] },
    ];
  });

  const [details] = await readDetails(account.id, account.currency, ['campaign'], [window], true);
  expect(details.campaign.sets).toHaveLength(1);
  const set = details.campaign.sets[0];
  expect(set.id).toBe('set');
  expect(set.stats).toBeUndefined();
  expect(set.ads).toHaveLength(1);
  const ad = set.ads[0];
  expect(ad).toMatchObject({ id: 'historical', name: 'historical', status: 'Unreported' });
  expect(ad.stats).toBeUndefined();
  expect(ad.days).toEqual([
    { day: window.since, spend: '10', impressions: '100', ctr: '2', cpc: '5', frequency: '1',
      clicks: '2', purchases: null, leads: null },
    { day: window.until, spend: '0', impressions: '0', ctr: '', cpc: '', frequency: '',
      clicks: '', purchases: null, leads: 0 },
  ]);
  expect(details.campaign.notes).toEqual(expect.arrayContaining([
    'ad metrics · Meta denied access for this connection.',
    'adset metrics · Meta denied access for this connection.',
  ]));
  expect(api.graph).not.toHaveBeenCalled();
});

it('attaches daily rows to an existing ad while preserving its inventory metadata and aggregate metrics', async () => {
  api.fetch.mockImplementation(async (path, params) => {
    if (path.endsWith('/ads')) return [{ id: 'ad', campaign_id: 'campaign', adset_id: 'set',
      name: 'Original ad', effective_status: 'PAUSED', creative: { id: 'creative', body: 'Original copy' } }];
    if (!path.endsWith('/insights') || params.level !== 'ad') return [];
    if (params.time_increment) return [{ campaign_id: 'campaign', adset_id: 'set', ad_id: 'ad',
      date_start: window.until, spend: '5', impressions: '100' }];
    return [{ campaign_id: 'campaign', adset_id: 'set', ad_id: 'ad', spend: '25', impressions: '500' }];
  });

  const [details] = await readDetails(account.id, account.currency, ['campaign'], [window], true);
  const ads = details.campaign.sets[0].ads;
  expect(ads).toHaveLength(1);
  expect(ads[0]).toMatchObject({ name: 'Original ad', status: 'PAUSED',
    creative: { id: 'creative', copy: ['Original copy'] }, stats: { spend: 25, impressions: 500 } });
  expect(ads[0].days).toHaveLength(1);
  expect(ads[0].days?.[0].spend).toBe('5');
});

function mockPreviousSources(accountResult: 'denied' | 'empty' | 'available', campaignDenied = false) {
  api.fetch.mockImplementation(async (path, params) => {
    if (!path.endsWith('/insights')) return [];
    const range = JSON.parse(params.time_range);
    const prior = range.since === previous.since && range.until === previous.until;
    if (params.level === 'ad') return [];
    if (params.level === 'adset') return prior ? [{ campaign_id: 'campaign', adset_id: 'set',
      results: [{ indicator: 'page_visit_view', values: [{ value: '90' }] }] }] : [];
    if (params.level === 'account') {
      if (prior && accountResult === 'denied') throw denied();
      return prior && accountResult === 'empty' ? [] : [{ spend: prior ? '50' : '100', impressions: '1000' }];
    }
    if (prior && campaignDenied) throw denied();
    return [{ campaign_id: 'campaign', campaign_name: 'Measured campaign', objective: 'OUTCOME_LEADS',
      spend: prior ? '50' : '100', impressions: '1000', actions: [{ action_type: 'lead', value: '5' }] }];
  });
}

it('preserves previous campaign rows and ad-set outcome enrichment when previous account totals return 403', async () => {
  mockPreviousSources('denied');
  const [period] = await readDailyReview(account, [window]);

  expect(period.previous?.window).toEqual(previous);
  expect(period.previous?.totals).toBeNull();
  expect(period.previous?.campaigns).toHaveLength(1);
  expect(period.previous?.campaigns[0]).toMatchObject({ id: 'campaign', spend: 50,
    impressions: 1000, leads: 5, purchases: null, facebookVisits: 90, status: 'Unknown' });
  expect(period.reviewNotes).toContain('Previous-period account totals · Meta denied access for this connection.');
  expect(period.reviewNotes?.join(' ')).not.toContain('No account-level row returned');
});

it('preserves previous account totals when previous campaign insights return 403', async () => {
  mockPreviousSources('available', true);
  const [period] = await readDailyReview(account, [window]);

  expect(period.previous?.totals).toMatchObject({ spend: 50, impressions: 1000, purchases: null });
  expect(period.previous?.campaigns).toEqual([]);
  expect(period.reviewNotes).toContain('Previous-period campaign metrics · Meta denied access for this connection.');
});

it('keeps an empty previous account response unknown while preserving campaign rows', async () => {
  mockPreviousSources('empty');
  const [period] = await readDailyReview(account, [window]);

  expect(period.previous?.totals).toBeNull();
  expect(period.previous?.campaigns[0].spend).toBe(50);
  expect(period.reviewNotes).toContain('No account-level row returned for the previous period; this is not a verified zero.');
  expect(period.reviewNotes?.join(' ')).not.toContain('Meta denied access');
});
