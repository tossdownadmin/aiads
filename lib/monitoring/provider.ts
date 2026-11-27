import type { MetaAccount } from '../meta/read';
import { accountToday, previousWindow, shiftDay, type Window } from '../reports/model';
import type { Period, Row, Source, SourceKey, Sources } from './types';

const VERSION = process.env.META_API_VERSION || 'v27.0';
const BASE = `https://graph.facebook.com/${VERSION}`;
const FIELDS = 'account_id,account_currency,date_start,date_stop,spend,impressions,reach,frequency,clicks,ctr,cpc,actions,action_values,purchase_roas,video_thruplay_watched_actions,instagram_profile_visits';
type Query = {path:string;params:Record<string,string>;single?:boolean};

/** GET-only reader; no tokens, provider messages or paging URLs enter stored evidence. */
async function read(query: Query, signal: AbortSignal): Promise<Source> {
  const source:Source = {state:'unavailable',apiVersion:VERSION,path:query.path,params:query.params,retrievedAt:new Date().toISOString(),data:null};
  try {
    const token=process.env.META_SYSTEM_USER_TOKEN;
    if(!token)throw Error('connection');
    const rows:Row[]=[],cursors=new Set<string>();let after:string|undefined;
    for(let page=0;page<100;page++) {
      const url=new URL(BASE+'/'+query.path);
      for(const [key,value] of Object.entries({...query.params,...(after?{after}:{})}))url.searchParams.set(key,value);
      const response=await fetch(url,{method:'GET',cache:'no-store',signal,headers:{Authorization:`Bearer ${token}`}});
      if(!response.ok&&response.status===400&&query.params.fields?.split(',').includes('instagram_profile_visits')) {
        const error=await response.json().catch(()=>null);
        if(error?.error?.code===100&&/instagram_profile_visits/.test(String(error.error.message))&&/not.*valid|invalid|nonexisting|does not exist|unsupported/i.test(String(error.error.message))) {
          return read({...query,params:{...query.params,fields:query.params.fields.split(',').filter(f=>f!=='instagram_profile_visits').join(',')}},signal);
        }
      }
      if(!response.ok)throw Error(response.status===429?'rate_limit':response.status===403?'permission':'source_request');
      const value=await response.json();
      if(!value||typeof value!=='object'||value.error)throw Error('source_shape');
      if(query.single) { if(typeof value.id!=='string')throw Error('source_shape');return {...source,state:'available',data:[value],retrievedAt:new Date().toISOString()}; }
      if(!Array.isArray(value.data)||value.data.some((row:unknown)=>!row||typeof row!=='object'||Array.isArray(row)))throw Error('source_shape');
      rows.push(...value.data);
      if(!value.paging?.next)return {...source,state:'available',data:rows,retrievedAt:new Date().toISOString()};
      const cursor=value.paging?.cursors?.after;
      if(typeof cursor!=='string'||!cursor||cursors.has(cursor))throw Error('incomplete_pagination');
      cursors.add(cursor);after=cursor;
    }
    throw Error('pagination_limit');
  } catch(error) {
    const code=signal.aborted?'timeout':error instanceof Error&&/^(connection|rate_limit|permission|source_request|source_shape|incomplete_pagination|pagination_limit)$/.test(error.message)?error.message:'source_unavailable';
    return {...source,reason:code,retrievedAt:new Date().toISOString()};
  }
}

export async function discoverMonitorAccounts():Promise<MetaAccount[]> {
  const source=await read({path:'me/adaccounts',params:{fields:'id,name,account_status,currency,timezone_name',limit:'100'}},AbortSignal.timeout(24000));
  if(!source.data)throw Error('The Meta account connection could not be read. Retry the connection.');
  const ids=new Set<string>();
  return source.data.map(row=>{
    const id=String(row.id),currency=String(row.currency),timezone=String(row.timezone_name||'');
    if(!/^act_\d+$/.test(id)||ids.has(id)||!/^[A-Z]{3}$/.test(currency)||!timezone)throw Error('Meta account metadata is incomplete.');
    accountToday(timezone);ids.add(id);
    return {id,currency,timezone,name:String(row.name||id),status:Number(row.account_status)};
  });
}

export function monitoringWindows(account:MetaAccount,period:Period,now=new Date()) {
  if(!account.timezone)throw Error('Account timezone is required for monitoring.');
  const until=shiftDay(accountToday(account.timezone,now),-1),window={since:shiftDay(until,period==='7d'?-6:-29),until};
  return {window,previous:previousWindow(window),month:{since:until.slice(0,7)+'-01',until}};
}

export async function collectMonitorSources(account:MetaAccount,period:Period,now=new Date()):Promise<{sources:Sources;window:Window;previous:Window}> {
  if(!/^act_\d+$/.test(account.id))throw Error('Invalid account');
  const {window,previous,month}=monitoringWindows(account,period,now),id=account.id;
  const insight=(level:string,range:Window):Query=>({path:id+'/insights',params:{
    fields:(level==='campaign'?'campaign_id,campaign_name,objective,':level==='ad'?'campaign_id,adset_id,ad_id,ad_name,':'')+FIELDS,
    level,time_range:JSON.stringify(range),use_account_attribution_setting:'true',action_report_time:'impression',limit:'200',
  }});
  const queries:Record<SourceKey,Query>={
    account:{path:id,params:{fields:'id,name,account_status,currency,timezone_name'},single:true},
    nativeScore:{path:id,params:{fields:'id,opportunity_score'},single:true},
    campaigns:{path:id+'/campaigns',params:{fields:'id,name,status,effective_status,objective,start_time,stop_time',limit:'200'}},
    adsets:{path:id+'/adsets',params:{fields:'id,name,campaign_id,effective_status,optimization_goal,promoted_object,destination_type,start_time,end_time',limit:'200'}},
    ads:{path:id+'/ads',params:{fields:'id,name,campaign_id,adset_id,status,effective_status,creative{id,name,thumbnail_url}',limit:'200'}},
    currentAccount:insight('account',window),currentCampaigns:insight('campaign',window),currentAds:insight('ad',window),
    previousAccount:insight('account',previous),previousCampaigns:insight('campaign',previous),previousAds:insight('ad',previous),monthAccount:insight('account',month),
  };
  // One wall-clock budget bounds a slow account. Individual failures do not erase others.
  const signal=AbortSignal.timeout(24000),sources={} as Sources;
  const entries=Object.entries(queries) as [SourceKey,Query][];let cursor=0;
  await Promise.all(Array.from({length:4},async()=>{while(cursor<entries.length){const [key,query]=entries[cursor++];sources[key]=await read(query,signal);}}));
  return {sources,window,previous};
}
