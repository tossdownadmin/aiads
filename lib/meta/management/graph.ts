import { fetchGraph, fetchAllPages } from '../read';
import type { Entity, Kind } from './types';

export const fields:Record<Kind,string> = {
  campaign:'id,account_id,name,status,effective_status,objective,daily_budget,lifetime_budget,bid_strategy,spend_cap,special_ad_categories',
  adset:'id,account_id,campaign_id,name,status,effective_status,daily_budget,lifetime_budget,bid_strategy,bid_amount,targeting,optimization_goal,billing_event,start_time,end_time,promoted_object,attribution_spec,destination_type',
  ad:'id,account_id,campaign_id,adset_id,name,status,effective_status,creative{id,name,object_story_spec,object_story_id,thumbnail_url,url_tags}',
  creative:'id,account_id,name,object_story_spec,object_story_id,effective_object_story_id,thumbnail_url,url_tags',
};
export async function entity(kind:Kind,id:string,accountId:string):Promise<Entity> {
  if(!/^\d+$/.test(id))throw new Error('Invalid Meta object.');
  const result=await fetchGraph(id,{fields:fields[kind]}) as Entity;
  if(result.account_id?.replace(/^act_/,'')!==accountId.replace(/^act_/,''))throw new Error('This object does not belong to the selected account.');
  return result;
}
export async function inventory(accountId:string,kind:Kind,parentId?:string) {
  const edges:Record<Kind,string>={campaign:'campaigns',adset:'adsets',ad:'ads',creative:'adcreatives'};
  if(parentId)await entity(kind==='adset'?'campaign':'adset',parentId,accountId);
  return fetchAllPages<Entity>(`${parentId||accountId}/${edges[kind]}`,{fields:fields[kind],limit:'100'});
}
export async function accountAccess(accountId:string) {
  const account=await fetchGraph(accountId,{fields:'id,name,currency,timezone_name,account_status,user_tasks'});
  const permissions=await fetchAllPages<{permission:string;status:string}>('me/permissions',{limit:'100'});
  const management=permissions.some(p=>p.permission==='ads_management'&&p.status==='granted');
  const tasks=Array.isArray(account.user_tasks)?account.user_tasks:[];
  const role=tasks.some((t:string)=>t==='MANAGE'||t==='ADVERTISE');
  const ids=(process.env.META_WRITE_ACCOUNT_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
  const reasons:string[]=[];
  if(process.env.META_WRITE_ENABLED!=='true')reasons.push('Campaign editing has not been enabled on the server.');
  if(!ids.includes(accountId)&&!ids.includes(accountId.replace(/^act_/,'')))reasons.push('This account is not enabled for campaign editing.');
  if(!management)reasons.push('The Meta connection needs ads_management permission.');
  if(!role)reasons.push('The system user needs advertiser or manager access to this account.');
  if(Number(account.account_status)!==1)reasons.push('Meta reports that this account is not active.');
  if(!process.env.BLOB_READ_WRITE_TOKEN)reasons.push('Private change history storage is not configured.');
  return {account:{id:account.id,name:account.name,currency:account.currency,timezone:account.timezone_name,status:account.account_status},canWrite:reasons.length===0,reasons,permissionGranted:management,roleGranted:role};
}
/** Intentionally no retry: a timeout can mean Meta accepted the write. */
export async function postGraph(path:string,values:Record<string,unknown>):Promise<Record<string,unknown>> {
  if(!/^(?:act_\d+\/(?:campaigns|adsets|ads|adcreatives|adimages|advideos)|\d+)$/.test(path))throw new Error('Unsupported Meta write path.');
  const token=process.env.META_SYSTEM_USER_TOKEN;
  if(!token)throw new Error('Meta connection unavailable.');
  const body=new URLSearchParams();
  for(const [key,value] of Object.entries(values))if(value!==undefined)body.set(key,typeof value==='object'?JSON.stringify(value):String(value));
  let response:Response;
  try {response=await fetch(`https://graph.facebook.com/${process.env.META_API_VERSION||'v27.0'}/${path}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(25000),cache:'no-store'});}
  catch {throw Object.assign(new Error('Meta did not confirm the result. Check Ads Manager before making another attempt.'),{uncertain:true});}
  let result;
  try{result=await response.json();}catch{throw Object.assign(new Error('Meta returned an unreadable result. Check Ads Manager before retrying.'),{uncertain:true});}
  if(!result||typeof result!=='object'||Array.isArray(result)||response.status>=500)throw Object.assign(new Error('Meta did not confirm this change. Check Ads Manager before retrying.'),{uncertain:true});
  if(!response.ok||result.error)throw Object.assign(new Error('Meta rejected this change. Review the settings and account access in Ads Manager.'),{metaCode:result.error?.code});
  return result;
}
export async function assets(accountId:string) {
  const [pages,pixels,images,videos,creatives]=await Promise.allSettled([
    fetchAllPages<Entity>(`${accountId}/promote_pages`,{fields:'id,name,instagram_business_account',limit:'100'}),
    fetchAllPages<Entity>(`${accountId}/adspixels`,{fields:'id,name',limit:'100'}),
    fetchGraph(`${accountId}/adimages`,{fields:'id,name,hash,url',limit:'100'}),
    fetchGraph(`${accountId}/advideos`,{fields:'id,title,picture,status',limit:'100'}),
    fetchGraph(`${accountId}/adcreatives`,{fields:fields.creative,limit:'100'}),
  ]);
  const values=[pages,pixels,images,videos,creatives];
  return Object.fromEntries(['pages','pixels','images','videos','creatives'].map((key,i)=>[key,values[i].status==='fulfilled'?('data' in values[i].value?values[i].value.data:values[i].value):null]));
}
