import type { MetaAccount, MetaCampaign } from '../meta/read';

export type Window = { since: string; until: string; partial?: boolean };
export type Row = Record<string, unknown>;
export type Metrics = ReturnType<typeof metrics>;
export type CampaignRow = ReturnType<typeof joinCampaigns>[number];
export type Snapshot = { window: Window; totals: Metrics | null; campaigns: CampaignRow[]; notes: string[] };
export type Pixel = { name: string; lastFired: string | null; sources: string[] | null };
export type Tracking = { checkedAt: string; pixels: Pixel[] | null; since: string };
export type Report = { account: MetaAccount; generated: string; periods: Snapshot[]; tracking?: Tracking; competitorEvidence?: { client: string; checkedAt: string; coverage: string; ads: { id: string; advertiser: string; text: string; url?: string }[] } };
export type PlanInputs = { cap?: number; previousCap?: number; brief: string; competitors: string; event: string };
export type Proposal = {
  summary: string; financialReview: string; performance: string[]; competitors: string[];
  event: string; allocation: { campaignId: string; percent: number; rationale: string }[];
  concepts: { campaignId: string; concept: string; format: string; visual: string; copy: string }[];
  takeaways: string[]; gaps: string[];
};

export function validDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
export function shiftDay(value: string, days: number) {
  const date = new Date(value + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function accountToday(timezone?: string, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function dailyWindows(end: string, today: string): Window[] {
  if (!validDay(end) || end >= today) throw new Error('Choose a completed reporting day in the account time zone.');
  return [7, 30].map(days => ({ since: shiftDay(end, 1 - days), until: end }));
}
export function planningWindow(month: string, today: string): Window {
  const first = month + '-01';
  if (!validDay(first)) throw new Error('Choose a valid plan month.');
  const last = shiftDay(first, -1);
  const since = last.slice(0, 7) + '-01';
  const until = last < today ? last : shiftDay(today, -1);
  if (until < since) throw new Error('The baseline month has no completed days yet.');
  return { since, until, partial: until < last };
}
function numeric(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
}
function action(value: unknown, names: string[]) {
  if (!Array.isArray(value)) return null;
  for (const name of names) {
    const found = value.find(item => item?.action_type === name && numeric(item.value) !== null);
    if (found) return numeric(found.value);
  }
  return null;
}
const purchaseTypes = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'];
const leadTypes = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'];
export function metrics(row: Row = {}) {
  const spend = numeric(row.spend);
  const purchases = action(row.actions, purchaseTypes);
  const purchaseValue = action(row.action_values, purchaseTypes);
  const reportedRoas = action(row.purchase_roas, purchaseTypes);
  return {
    spend, impressions: numeric(row.impressions), reach: numeric(row.reach), frequency: numeric(row.frequency),
    clicks: numeric(row.clicks), ctr: numeric(row.ctr), cpc: numeric(row.cpc),
    purchases, leads: action(row.actions, leadTypes), purchaseValue,
    roas: reportedRoas ?? (spend && purchaseValue !== null ? purchaseValue / spend : null),
    instagramVisits: numeric(row.instagram_profile_visits) ?? action(row.actions, ['onsite_conversion.instagram_profile_visit', 'instagram_profile_visit']),
    landingViews: action(row.actions, ['landing_page_view', 'omni_landing_page_view']),
    linkClicks: action(row.actions, ['link_click']),
    thruplays: action(row.video_thruplay_watched_actions, ['video_view']),
  };
}
export function joinCampaigns(config: MetaCampaign[], insights: Row[], window: Window) {
  const byId = new Map(config.map(c => [c.id, c]));
  const observed = new Map(insights.map(row => [String(row.campaign_id), row]));
  const ids = new Set(observed.keys());
  for (const item of config) {
    if (item.effective_status === 'ACTIVE' && (!item.start_time || item.start_time.slice(0, 10) <= window.until)) ids.add(item.id);
  }
  return Array.from(ids, id => {
    const row = observed.get(id);
    const current = byId.get(id);
    return { id, name: String(row?.campaign_name || current?.name || id), objective: String(row?.objective || current?.objective || ''),
      status: current?.effective_status || 'Unknown', stop: current?.stop_time?.slice(0, 10) || null,
      hasInsights: Boolean(row), ...metrics(row) };
  }).sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0) || a.name.localeCompare(b.name));
}
export function outcomes(row: Metrics) {
  const groups: [string, number | null][] = [['Purchases', row.purchases], ['Leads', row.leads], ['IG profile visits', row.instagramVisits],
    ['Landing page views', row.landingViews], ['Link clicks', row.linkClicks], ['ThruPlays', row.thruplays]];
  return groups.filter((item): item is [string, number] => item[1] !== null);
}
export function signals(snapshot: Snapshot): { finding: string; action: string }[] {
  const rows = snapshot.campaigns;
  const noRow = rows.filter(c => !c.hasInsights && c.status === 'ACTIVE');
  const paused = rows.filter(c => c.status === 'PAUSED' && (c.spend ?? 0) > 0);
  const missing = rows.filter(c => (c.spend ?? 0) > 0 && ((/LEAD/i.test(c.objective) && c.leads === null) || (/SALES|CONVERSIONS/i.test(c.objective) && c.purchases === null)));
  const findings = [];
  if (noRow.length) findings.push({ finding: noRow.length + ' currently active campaign(s) had no reporting row in this period.', action: 'Check start dates, budgets and delivery in Ads Manager before relying on them.' });
  if (paused.length) findings.push({ finding: paused.length + ' currently paused campaign(s) contributed spend, including ' + paused[0].name + '.', action: 'Include their historical results when comparing campaign structures.' });
  if (missing.length) findings.push({ finding: missing.length + ' campaign(s) with spend have no reported purchase or lead for the indicated objective.', action: 'Verify the optimized event and attribution settings before judging efficiency.' });
  if (!rows.some(c => (c.impressions ?? 0) > 0 || (c.spend ?? 0) > 0)) findings.push({ finding: 'No campaign delivery was returned for these dates.', action: 'Check account status, schedule and the selected reporting period.' });
  return findings;
}
export function money(value: number | null, currency: string) {
  return value === null ? '—' : new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'code' }).format(value);
}
export function planAmounts(allocations: Proposal['allocation'], cap: number, currency: string): number[] {
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const scale = 10 ** digits;
  const units = Math.round(cap * scale);
  let assigned = 0, percent = 0;
  return allocations.map(a => {
    percent += a.percent;
    const cumulative = Math.round(units * percent / 100);
    const part = cumulative - assigned;
    assigned = cumulative;
    return part / scale;
  });
}
