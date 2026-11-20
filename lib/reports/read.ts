import { readDetails, limitation } from '../meta/campaign-detail';
import { fetchAllPages, getCampaigns, type MetaAccount } from '../meta/read';
import { joinCampaigns, metrics, previousWindow, type Row, type DeliverySettings, type Snapshot, type Tracking, type Window } from './model';
import type { DailyClientContext } from './client-context';

const fields = 'spend,impressions,reach,frequency,clicks,ctr,cpc,actions,conversions,action_values,purchase_roas,video_thruplay_watched_actions';

export async function readReportWindows(account: MetaAccount, windows: Window[], dailyReview=false): Promise<Snapshot[]> {
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
  const snapshots = await Promise.all(windows.map(async window => {
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
  const ids = [...new Set(snapshots.flatMap(p => p.campaigns.map(c => c.id)))];
  const details = await readDetails(account.id, account.currency, ids, windows, dailyReview);
  return snapshots.map((p,i) => ({...p, details:details[i],campaigns:p.campaigns.map(c=>{
    const reported=details[i]?.[c.id]?.sets.filter(set=>set.stats)||[];
    // Page-visit results can be available only at ad-set level. Roll up complete
    // reporting rows once; do not also add the same ads or attribution variants.
    const filled={...c};
    for(const key of ['facebookVisits','instagramVisits'] as const) {
      if(filled[key]===null&&reported.length&&!reported.some(set=>set.stats![key]===null))filled[key]=reported.reduce((total,set)=>total+set.stats![key]!,0);
    }
    return filled;
  })}));
}

/** Equal-length, nonoverlapping history; no historical state is inferred from today's switches. */
async function readPrevious(account:MetaAccount,window:Window):Promise<{value:NonNullable<Snapshot['previous']>;notes:string[]}> {
  const params={time_range:JSON.stringify(window),use_unified_attribution_setting:'true',limit:'200'};
  const notes:string[]=[];
  async function insights(level:'campaign'|'account') {
    const base=(level==='campaign'?'campaign_id,campaign_name,objective,':'')+fields;
    try{return await fetchAllPages<Row>(account.id+'/insights',{...params,level,fields:base+',instagram_profile_visits'});}
    catch(e){
      if(!(e instanceof Error)||!/instagram_profile_visits|not a valid.*field|invalid metric/i.test(e.message))throw e;
      notes.push('Previous-period direct Instagram visits unavailable.');
      return fetchAllPages<Row>(account.id+'/insights',{...params,level,fields:base});
    }
  }
  const [campaignResult,accountResult]=await Promise.allSettled([insights('campaign'),insights('account')]);
  const rows=campaignResult.status==='fulfilled'?campaignResult.value:[];
  const totals=accountResult.status==='fulfilled'?accountResult.value:null;
  if(campaignResult.status==='rejected')notes.push(limitation('Previous-period campaign metrics',campaignResult.reason));
  if(accountResult.status==='rejected')notes.push(limitation('Previous-period account totals',accountResult.reason));
  const campaigns=joinCampaigns([],rows,window);
  // Facebook Page visits can be an ad-set-only primary result. Join by campaign
  // and never sum attribution alternatives or add ad rows to ad-set rows.
  for(let offset=0;offset<campaigns.length;offset+=40){
    const group=campaigns.slice(offset,offset+40);
    try {
      const sets=await fetchAllPages<Row>(account.id+'/insights',{...params,level:'adset',fields:'campaign_id,adset_id,spend,actions,results',filtering:JSON.stringify([{field:'campaign.id',operator:'IN',value:group.map(c=>c.id)}])});
      for(const c of group){
        const matched=sets.filter(s=>s.campaign_id===c.id).map(s=>metrics(s));
        for(const key of ['facebookVisits','instagramVisits'] as const)if(c[key]===null&&matched.length&&matched.every(s=>s[key]!==null))c[key]=matched.reduce((n,s)=>n+s[key]!,0);
      }
    }catch(e){notes.push(limitation('Previous-period profile visit results',e));}
  }
  if(totals&&!totals.length)notes.push('No account-level row returned for the previous period; this is not a verified zero.');
  return {value:{window,totals:totals?.[0]?metrics(totals[0]):null,campaigns},notes};
}

export async function readDailyReview(account:MetaAccount,windows:Window[],context:DailyClientContext|null=null):Promise<Snapshot[]> {
  const contextMismatch=!!context&&(context.accountId!==account.id||context.currency!==account.currency);
  if(contextMismatch)context=null;
  const [periods,previous]=await Promise.all([
    readReportWindows(account,windows,true),
    Promise.all(windows.map(async w=>{
      const window=previousWindow(w);
      try{return await readPrevious(account,window);}
      catch(e){return {value:{window,totals:null,campaigns:[]},notes:[limitation('Previous-period comparison',e)]};}
    })),
  ]);
  let pacing:Snapshot['pacing'];
  const budgetNotes:string[]=[];
  const end=windows[0]?.until, month=end?.slice(0,7);
  if(context?.monthlyBudget&&context.budgetMonth===month&&context.currency===account.currency){
    try {
      const result=await readComparison(account.id,{since:month+'-01',until:end});
      if(result.totals?.spend!=null){
        const elapsedDays=Number(end.slice(-2)),monthDays=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();
        pacing={month,budget:context.monthlyBudget,spent:result.totals.spend,elapsedDays,monthDays,expectedSpend:context.monthlyBudget*elapsedDays/monthDays,projectedSpend:result.totals.spend/elapsedDays*monthDays};
      }else budgetNotes.push('Month-to-date spend was not returned; budget pacing is unavailable.');
    }catch(e){budgetNotes.push(limitation('Approved budget pacing',e));}
  }else budgetNotes.push(context?.monthlyBudget?'The saved budget does not match this reporting month or currency.':'No approved monthly budget supplied; pacing is unavailable.');
  return periods.map((p,i)=>({
    ...p,previous:previous[i].value,pacing,
    reviewNotes:[...new Set([
      ...previous[i].notes,...budgetNotes,
      ...Object.values(p.details??{}).flatMap(d=>d.notes),
      ...(!context?.businessGoal?['No client business goal supplied.']:[]),
      ...(contextMismatch?['Saved targets were ignored because their account or currency did not match this Meta account. Review and resave the client context.']:[]),
      ...(!context?.targetCpa&&!context?.targetCpl&&!context?.targetRoas?['No approved CPA, CPL or ROAS targets supplied.']:[]),
      'Lead qualification, offline sales and margins are not verified by a connected CRM or store.',
      'Ad analysis uses measured performance, settings and supplied copy; full images and videos are available for review, not visually analysed by this skill.',
    ])],
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
