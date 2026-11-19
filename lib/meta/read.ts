const GRAPH_VERSION = process.env.META_API_VERSION || 'v27.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
export type MetaAccount = { id: string; name: string; status: number; currency: string; timezone?: string };
function token() { const value = process.env.META_SYSTEM_USER_TOKEN; if (!value) throw new Error('Meta connection is not configured'); return value; }
export async function fetchGraph(path: string, params: Record<string,string> = {}) {
  const url = new URL(`${GRAPH}/${path}`);
  Object.entries(params).forEach(([key,value])=>url.searchParams.set(key,value));
  let response = await fetch(url, { cache: 'no-store', headers: { Authorization: `Bearer ${token()}` } });
  if (response.status === 429 || response.status >= 500) {
    await new Promise(resolve => setTimeout(resolve, 300));
    response = await fetch(url, { cache: 'no-store', headers: { Authorization: `Bearer ${token()}` } });
  }
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data?.error?.message || `Meta API returned ${response.status}`), { code: data?.error?.code, status: response.status });
  return data;
}
export async function fetchAllPages<T>(path: string, params: Record<string,string>) {
  const records: T[] = [];
  const cursors = new Set<string>();
  let after: string | undefined;
  for (let page = 0; page < 100; page += 1) {
    const data = await fetchGraph(path, { ...params, ...(after ? { after } : {}) });
    records.push(...((data.data || []) as T[]));
    const next = data.paging?.cursors?.after as string | undefined;
    if (!data.paging?.next) return records;
    if (!next || cursors.has(next)) throw new Error('Incomplete Meta pagination');
    cursors.add(next);
    after = next;
  }
  throw new Error('Meta pagination limit reached');
}
export async function getAdAccounts(): Promise<MetaAccount[]> {
  const rows = await fetchAllPages<Record<string,string|number>>('me/adaccounts', { fields:'id,name,account_status,currency,timezone_name', limit:'100' });
  return rows.map(a=>({ id:String(a.id), name:String(a.name), status:Number(a.account_status), currency:String(a.currency), timezone:String(a.timezone_name || '') }));
}
export async function getAccountInsights(accountId: string, period: 'last_7d'|'last_30d') {
  if (!/^act_\d+$/.test(accountId)) throw new Error('Invalid ad account ID');
  const fields='campaign_name,campaign_id,objective,account_currency,spend,impressions,reach,frequency,clicks,ctr,cpc,actions,action_values,purchase_roas';
  const params={level:'campaign',date_preset:period,limit:'500'};
  let data;
  try {
    data=await fetchAllPages<Record<string,unknown>>(`${accountId}/insights`,{...params,fields:fields+',instagram_profile_visits'});
  } catch(error) {
    if(!(error instanceof Error) || !/instagram_profile_visits|not a valid.*field|invalid metric/i.test(error.message))throw error;
    data=await fetchAllPages<Record<string,unknown>>(`${accountId}/insights`,{...params,fields});
  }
  return { data };
}

export type MetaCampaign = { id: string; name: string; status: string; effective_status: string; objective?: string; daily_budget?: string; lifetime_budget?: string; start_time?: string; stop_time?: string };
export async function getCampaigns(accountId: string): Promise<MetaCampaign[]> {
  if (!/^act_\d+$/.test(accountId)) throw new Error('Invalid ad account ID');
  const rows = await fetchAllPages<Record<string, string>>(`${accountId}/campaigns`, {
    fields:'id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time',
    limit:'200',
  });
  return rows.map(row => ({
    id: String(row.id), name: String(row.name), status: String(row.status || ''), effective_status: String(row.effective_status || ''),
    objective: row.objective, daily_budget: row.daily_budget, lifetime_budget: row.lifetime_budget, start_time: row.start_time, stop_time: row.stop_time,
  }));
}

export async function getActiveCampaigns(accountId: string): Promise<MetaCampaign[]> {
  return (await getCampaigns(accountId)).filter(row => row.effective_status === 'ACTIVE');
}
