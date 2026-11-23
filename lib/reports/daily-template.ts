import type { MetaAccount } from '../meta/read';

export type ColumnSet = 'SALES' | 'VISITS' | 'MIXED' | 'MIXROAS' | 'LEADS';
export type MetricBinding={metric:keyof import('./model').Metrics;calculation?:'cost_per_result';campaignIds?:string[]};
export type PeriodLayout = { cards: string[]; kpis: string[]; columns: ColumnSet; scopes?: Record<string,string>; bindings?:Record<string,MetricBinding>; summary?: string[] };
export type ClientLayout = { name: string; accountId?: string; currency?: string; market?: string; type?: string; periods?: PeriodLayout[] };
export type Exclusion = { name: string; reason: string };
export type DailyTemplate = { clients: ClientLayout[] };
export const templateKey = 'tossdown.daily-report.template.v1';

const clean = (s: string) => s.replace(/\\(['"\\])/g, '$1').slice(0, 140).trim();
const quoted = "'((?:\\\\.|[^'\\\\])*)'";
const field = (line: string, key: string) => clean(line.match(new RegExp('(?:^|[,\\{])\\s*'+key+'\\s*:\\s*'+quoted))?.[1] ?? '');

// The reference stores labels in a script literal. Read its label rows as text.
// Never execute the file or carry old measurements, findings or markup into a new report.
function labels(part: string, key: string) {
  const line = part.match(new RegExp('^\\s*'+key+':\\s*\\[(.*)\\],?\\s*$','m'))?.[1] ?? '';
  return Array.from(line.matchAll(new RegExp('(?:^|\\],\\s*)\\['+quoted+'\\s*,','g')), m => clean(m[1])).slice(0, 12);
}

function scopeLabel(text: string) {
  const match = /mutton|lahore|grocery|celebration|one.stop|karahi|post.workout|08\/10|21\/10|nb\+ns|courtenay|ig growth|profile|video|awareness|sales?|best/i.exec(text);
  return match?.[0].toLowerCase().replace(/^sales$/,'sale') || '';
}
function scopedLabels(part:string) {
  const line=part.match(/^\s*kpis:\s*\[(.*)\],?\s*$/m)?.[1]||'';
  const scopes:Record<string,string>={};
  for(const m of line.matchAll(new RegExp('(?:^|\\],\\s*)\\['+quoted+',\\s*'+quoted+',\\s*'+quoted,'g'))) {
    // Only named measurement scopes survive import. Old values and judgments are discarded.
    const explicit=/^(?:mutton menu|sale campaign|awareness (?:campaign|video)|nb\+ns only)$/i.test(m[3]);
    if(explicit) scopes[clean(m[1])]=scopeLabel(m[3]);
  }
  return scopes;
}
function summaryScopes(data:string,id:string,period:number,part:string) {
  const lines=data.split('const SUMS = {')[1]?.split('const NOT_INCLUDED')[0]?.split('\n')||[];
  const line=lines.find(s=>s.trimStart().startsWith(id+':'))||'';
  const row=(period===0?line.split('p7:[')[1]?.split('p30:[')[0]:line.split('p30:[')[1])||'';
  const cells:string[]=[];
  let cell='', nested=0, quote=false;
  for(let i=0;i<row.length;i++) {
    const ch=row[i];
    if(quote && ch==='\\') {cell+=row.slice(i,i+2);i++;continue;}
    if(ch==="'") quote=!quote;
    if(!quote && ch==='[') nested++;
    if(!quote && ch===']') { if(nested===0){cells.push(cell);break;} nested--; }
    if(!quote && ch===',' && nested===0){cells.push(cell);cell='';} else cell+=ch;
  }
  const scopes=cells.slice(2,7).map(c=>scopeLabel(c));
  const price=cells[3]?.match(/(?:\$|₨)\s*[\d,]+(?:\.\d+)?/)?.[0];
  if (!scopes[1] && price) {
    const kpis=part.match(/^\s*kpis:\s*\[(.*)\],?\s*$/m)?.[1]||'';
    for (const item of kpis.matchAll(new RegExp('(?:^|\\],\\s*)\\['+quoted+',\\s*'+quoted+',\\s*'+quoted,'g'))) {
      if (/cpl|cpp|cpr/i.test(item[1]) && item[2].match(/(?:\$|₨)\s*[\d,]+(?:\.\d+)?/)?.[0]===price) {
        const scope=scopeLabel(item[1]) || scopeLabel(item[3]);
        if (scope) {scopes[1]=scope;break;}
      }
    }
  }
  return scopes;
}

export function importDailyTemplate(source: string): DailyTemplate {
  if (source.length > 3_000_000) throw new Error('Choose the original daily HTML report, under 3 MB.');
  if (source.trimStart().startsWith('{')) {
    const value=readStoredTemplate(source);
    if (value) return value;
    throw new Error('These settings do not contain a supported daily report template.');
  }
  const embedded=source.match(/<script type="application\/json" id="tossdown-daily-template">([\s\S]*?)<\/script>/)?.[1];
  if (embedded) { const value=readStoredTemplate(embedded); if(value) return value; }
  const data = source.split('/*__DATA_START__*/')[1]?.split('/*__DATA_END__*/')[0];
  if (!data) throw new Error('Choose the original Meta Ads daily report HTML.');
  const accounts = data.split('const ACCOUNTS = [')[1]?.split('const ORDER')[0];
  const clients: ClientLayout[] = [];
  for (const item of (accounts ?? '').split(/(?=^\s*\{id:')/m)) {
    const meta = item.trimStart().split('\n')[0];
    const name = field(meta, 'name');
    if (!name) continue;
    const parts = item.split(/^\s*p(?:7|30):\{/m).slice(1);
    const periods = parts.map((part,index) => {
      const matched = part.match(/\bcols:\s*C_(SALES|VISITS|MIXROAS|MIXED|LEADS)\b/);
      return { cards: labels(part,'card'), kpis: labels(part,'kpis'), columns: (matched?.[1] || 'MIXED') as ColumnSet, scopes:scopedLabels(part), summary:summaryScopes(data,field(meta,'id'),index,part) };
    });
    if (periods.length !== 2 || periods.some(p => !p.cards.length || !p.kpis.length)) throw new Error('This file uses an unsupported daily report layout.');
    const id = field(meta,'acct');
    clients.push({ name, accountId: /^\d+$/.test(id) ? 'act_'+id : undefined, currency:field(meta,'cur'), market:field(meta,'short'), type:field(meta,'type'), periods });
  }
  if (!clients.length || clients.length>120) throw new Error('No supported daily report portfolio was found.');
  const omitted = data.split('const NOT_INCLUDED = [')[1]?.split(/^\s*\];/m)[0] ?? '';
  for (const line of omitted.split('\n')) {
    const match = line.match(new RegExp('^\\s*\\['+quoted+',\\s*'+quoted));
    if (!match) continue;
    const name = clean(match[1].split(' — ')[0]);
    const id = match[2].match(/\bad account\s+(\d+)\b/i)?.[1];
    if (name && !clients.some(c=>c.name===name)) clients.push({ name, accountId:id ? 'act_'+id : undefined });
  }
  return { clients };
}

export function readStoredTemplate(value: string | null): DailyTemplate | undefined {
  if (!value || value.length > 250000) return;
  try {
    const data = JSON.parse(value) as DailyTemplate;
    if (!Array.isArray(data.clients) || data.clients.length>180 || !data.clients.length) return;
    const str = (x: unknown) => typeof x === 'string' && x.length<=140;
    const valid = data.clients.every(c => c && str(c.name) && [c.currency,c.market,c.type].every(v=>v===undefined || str(v)) &&
      (!c.accountId || /^act_\d+$/.test(c.accountId)) &&
      (!c.periods || (Array.isArray(c.periods) && c.periods.length===2 && c.periods.every(p => p && ['SALES','VISITS','MIXED','MIXROAS','LEADS'].includes(p.columns) && [p.cards,p.kpis].every(a=>Array.isArray(a) && a.length<=12 && a.every(str)) && (!p.scopes || (typeof p.scopes==='object' && Object.entries(p.scopes).every(([k,v])=>str(k)&&str(v)))) && (!p.summary || (Array.isArray(p.summary) && p.summary.length<=5 && p.summary.every(str)))))));
    const metricKeys=['spend','impressions','reach','frequency','clicks','ctr','cpc','purchases','leads','purchaseValue','roas','instagramVisits','facebookVisits','conversations','landingViews','linkClicks','thruplays','formLeads','conversionLeads','websiteLeads','onMetaLeads'];
    const bindingsValid=data.clients.every(c=>c.periods?.every(p=>!p.bindings||Object.entries(p.bindings).every(([label,b])=>str(label)&&b&&metricKeys.includes(b.metric)&&(!b.calculation||b.calculation==='cost_per_result')&&(!b.campaignIds||(Array.isArray(b.campaignIds)&&b.campaignIds.length>0&&b.campaignIds.length<=50&&b.campaignIds.every(id=>typeof id==='string'&&/^[A-Za-z0-9_-]+$/.test(id))))))??true);
    if (valid&&bindingsValid) return data;
  } catch { /* An old or malformed preference is ignored. */ }
}

function nameKey(name: string) {
  return name.toLowerCase().replace(/^td\s+/, '').replace(/\s*[·-]?\s*ad account(?:\s+td)?$/,'').replace(/[^a-z0-9]/g,'').replace(/corps?$/,'corp');
}
export function matchPortfolio(template: DailyTemplate | undefined, accounts: MetaAccount[]) {
  const matches = new Map<string, ClientLayout>();
  const missing: Exclusion[] = [];
  for (const client of template?.clients ?? []) {
    const options = client.accountId ? accounts.filter(a=>a.id===client.accountId) : accounts.filter(a=>nameKey(a.name)===nameKey(client.name) && (!client.currency || a.currency===client.currency));
    if (options.length===1 && !matches.has(options[0].id)) matches.set(options[0].id,client);
    else missing.push({ name:client.name, reason: options.length ? 'Multiple possible matches. Confirm the Meta ad account ID.' : (client.accountId ? 'The template’s account ID is unavailable to this Meta connection.' : 'No matching account name is visible. Confirm the Meta ad account ID.') });
  }
  return { matches, missing };
}

