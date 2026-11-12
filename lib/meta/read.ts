const GRAPH_VERSION = process.env.META_API_VERSION || 'v27.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
function token() { const value = process.env.META_SYSTEM_USER_TOKEN; if (!value) throw new Error('Meta connection is not configured'); return value; }
async function fetchGraph(path: string, params: Record<string,string> = {}) {
  const url = new URL(`${GRAPH}/${path}`);
  Object.entries(params).forEach(([key,value])=>url.searchParams.set(key,value));
  const response = await fetch(url, { cache: 'no-store', headers: { Authorization: `Bearer ${token()}` } }); const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `Meta API returned ${response.status}`);
  return data;
}
export async function getAdAccounts() {
  const data = await fetchGraph('me/adaccounts', { fields:'id,name,account_status,currency,timezone_name', limit:'100' });
  return (data.data || []).map((a: Record<string,string|number>)=>({ id:a.id, name:a.name, status:a.account_status, currency:a.currency, timezone:a.timezone_name }));
}
export async function getAccountInsights(accountId: string, period: 'last_7d'|'last_30d') {
  if (!/^act_\d+$/.test(accountId)) throw new Error('Invalid ad account ID');
  return fetchGraph(`${accountId}/insights`, { level:'campaign', date_preset:period, fields:'campaign_name,campaign_id,objective,account_currency,spend,impressions,reach,frequency,clicks,ctr,cpc,actions,action_values,purchase_roas', limit:'500' });
}
