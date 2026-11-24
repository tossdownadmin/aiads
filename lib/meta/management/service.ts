import { createHash, randomUUID } from 'node:crypto';
import { fetchAllPages, fetchGraph } from '../read';
import { accountAccess, entity, postGraph } from './graph';
import { adFields, adsetFields, campaignFields, ManagementError, operationSchema, type Draft, type Entity, type Kind, type Step } from './types';
import { ChangeConflict, claimAccount, readDraft, saveDraft } from './store';

export function canonical(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([k,v])=>v!==undefined&&k!=='thumbnail_url').sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
  return JSON.stringify(value)??'null';
}
export const fingerprint=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
const targetKeys=new Set(['geo_locations','excluded_geo_locations','age_min','age_max','genders','locales','flexible_spec','exclusions','custom_audiences','excluded_custom_audiences','publisher_platforms','facebook_positions','instagram_positions','messenger_positions','audience_network_positions','device_platforms','user_device','user_os','wireless_carrier','interests','behaviors','connections','excluded_connections','friends_of_connections','targeting_automation']);
function validateTargeting(value:Record<string,unknown>) {
  if(Object.keys(value).some(k=>!targetKeys.has(k)))throw new ManagementError('Targeting contains an unsupported field. Preserve the existing settings or use Ads Manager for that field.');
  if(value.age_min!==undefined&&(!Number.isInteger(value.age_min)||Number(value.age_min)<18||Number(value.age_min)>65))throw new ManagementError('Minimum age must be between 18 and 65.');
  if(value.age_max!==undefined&&(!Number.isInteger(value.age_max)||Number(value.age_max)<18||Number(value.age_max)>65))throw new ManagementError('Maximum age must be between 18 and 65.');
  if(value.age_min!==undefined&&value.age_max!==undefined&&Number(value.age_min)>Number(value.age_max))throw new ManagementError('Minimum age must not exceed maximum age.');
}
function safePublicUrl(value:unknown) {
  let url:URL;try{url=new URL(String(value));}catch{throw new ManagementError('Use a public HTTPS URL.');}
  if(url.hostname.startsWith('[')||url.protocol!=='https:'||url.username||url.password||url.port||!url.hostname.includes('.')||/^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(url.hostname)||/\.(?:local|internal)$/.test(url.hostname))throw new ManagementError('Use a public HTTPS URL without credentials.');
}
function validateBudget(fields:Record<string,unknown>) {
  if(fields.daily_budget&&fields.lifetime_budget)throw new ManagementError('Choose either a daily or a lifetime budget.');
  if(fields.start_time&&fields.end_time&&Date.parse(String(fields.end_time))<=Date.parse(String(fields.start_time)))throw new ManagementError('End time must be later than start time.');
}
async function verifyCreative(accountId:string,creative:Record<string,unknown>) {
  const spec=creative.object_story_spec as Record<string,unknown>|undefined;
  const page=spec?.page_id||String(creative.object_story_id||'').split('_')[0];
  if(!/^\d+$/.test(String(page)))throw new ManagementError('Choose the Facebook Page for this creative.');
  const pages=await fetchAllPages<Entity>(`${accountId}/promote_pages`,{fields:'id,name',limit:'100'});
  if(!pages.some(p=>p.id===String(page)))throw new ManagementError('This Facebook Page is not available to the selected ad account.');
  if(spec) {
    if(Object.keys(spec).some(k=>!['page_id','instagram_user_id','link_data','video_data','photo_data','template_data'].includes(k)))throw new ManagementError('Creative content contains an unsupported field.');
    if(['link_data','video_data','photo_data','template_data'].filter(k=>spec[k]).length!==1)throw new ManagementError('Choose one creative format.');
    const link=spec.link_data as Record<string,unknown>|undefined;
    if(link){safePublicUrl(link.link);if(!link.image_hash&&!link.picture&&!Array.isArray(link.child_attachments))throw new ManagementError('Choose an account image or a public image URL.');}
    if(link?.picture)safePublicUrl(link.picture);
    if(link?.image_hash) {
      const images=await fetchGraph(`${accountId}/adimages`,{fields:'hash',hashes:JSON.stringify([link.image_hash])});
      if(!images.data?.some((i:{hash:string})=>i.hash===link.image_hash))throw new ManagementError('Choose an image from this ad account.');
    }
    const video=spec.video_data as Record<string,unknown>|undefined;
    if(video?.video_id){
      const videos=await fetchAllPages<Entity>(`${accountId}/advideos`,{fields:'id',limit:'100'});
      if(!videos.some(v=>v.id===video.video_id))throw new ManagementError('Choose a video from this ad account.');
    }
  }
}
export async function prepare(accountId:string,owner:string,raw:unknown):Promise<Draft> {
  const operation=operationSchema.parse(raw);
  const access=await accountAccess(accountId);
  const now=Date.now();
  const draft:Draft={id:String(9999999999999-now).padStart(13,'0')+'-'+randomUUID(),accountId,currency:access.account.currency,accountName:access.account.name,owner,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+10*60000).toISOString(),digest:'',state:'review',title:'Review campaign changes',operation,changes:[],warnings:[],dependencies:[],steps:[]};
  const cache=new Map<string,Entity>();
  const depend=async(kind:Kind,id:string):Promise<Entity>=>{
    const key=kind+':'+id;
    if(cache.has(key))return cache.get(key)!;
    const value=await entity(kind,id,accountId);cache.set(key,value);draft.dependencies.push({kind,id,fingerprint:fingerprint(value)});
    if(kind==='ad'&&value.adset_id)await depend('adset',String(value.adset_id));
    if((kind==='ad'||kind==='adset')&&value.campaign_id)await depend('campaign',String(value.campaign_id));
    if(kind==='ad'&&(value.creative as {id?:string})?.id)await depend('creative',(value.creative as {id:string}).id);
    return value;
  };
  const step=(kind:Step['kind'],path:string,fields:Record<string,unknown>,label:string)=>draft.steps.push({kind,path,fields,label});
  const change=(label:string,before:unknown,after:unknown)=>draft.changes.push({label,before:before??null,after});
  if(operation.action==='update') {
    const current=await depend(operation.kind,operation.id);
    const schema={campaign:campaignFields,adset:adsetFields,ad:adFields}[operation.kind];
    const values=schema.parse(operation.fields) as Record<string,unknown>;
    for(const key of Object.keys(values))if(canonical(values[key])===canonical(current[key]))delete values[key];
    if(!Object.keys(values).length)throw new ManagementError('Choose a field to change.');
    validateBudget(values);
    if(operation.kind==='adset'&&(values.daily_budget||values.lifetime_budget)){const parent=cache.get('campaign:'+current.campaign_id);if(Number(parent?.daily_budget)>0||Number(parent?.lifetime_budget)>0)throw new ManagementError('This campaign controls the budget. Edit the campaign budget instead.');}
    if(values.targeting){validateTargeting(values.targeting as Record<string,unknown>);values.targeting={...current.targeting as object,...values.targeting as object};const t=values.targeting as Record<string,unknown>;if(t.age_min!==undefined&&t.age_max!==undefined&&Number(t.age_min)>Number(t.age_max))throw new ManagementError('Minimum age must not exceed maximum age.');}
    if(values.end_time&&!values.start_time&&current.start_time&&Date.parse(String(values.end_time))<=Date.parse(String(current.start_time)))throw new ManagementError('End time must be later than the existing start time.');
    for(const [key,value] of Object.entries(values))change(`${current.name||operation.id} · ${key}`,current[key],value);
    step(operation.kind,operation.id,values,`Update ${current.name||operation.kind}`);
    draft.title=`Edit ${current.name||operation.kind}`;
  } else if(operation.action==='status') {
    const seen=new Set<string>();
    for(const target of operation.targets){
      const key=target.kind+target.id;if(seen.has(key))throw new ManagementError('An object appears more than once.');seen.add(key);
      const current=await depend(target.kind,target.id);
      change(`${current.name||target.id} · status`,current.status,target.status);
      step(target.kind,target.id,{status:target.status},`${target.status==='ACTIVE'?'Enable':'Pause'} ${current.name||target.kind}`);
    }
    draft.title=`Change delivery · ${operation.targets.length} object${operation.targets.length===1?'':'s'}`;
  } else if(operation.action==='create_campaign') {
    validateBudget(operation.fields);draft.title=`Create campaign · ${operation.fields.name}`;
    step('campaign',`${accountId}/campaigns`,{...operation.fields,status:'PAUSED'},draft.title);
  } else if(operation.action==='create_adset') {
    const campaign=await depend('campaign',operation.fields.campaign_id);validateBudget(operation.fields);validateTargeting(operation.fields.targeting);
    if(!operation.fields.targeting.geo_locations||!Object.keys(operation.fields.targeting.geo_locations as object).length)throw new ManagementError("Choose the locations for this ad set.");
    if(!Number(campaign.daily_budget)&&!Number(campaign.lifetime_budget)&&!operation.fields.daily_budget&&!operation.fields.lifetime_budget)throw new ManagementError('Set an ad-set budget when the campaign has no campaign budget.');
    if((Number(campaign.daily_budget)||Number(campaign.lifetime_budget))&&(operation.fields.daily_budget||operation.fields.lifetime_budget))throw new ManagementError('This campaign controls the budget. Set the budget on the campaign.');
    draft.title=`Create ad set · ${operation.fields.name}`;step('adset',`${accountId}/adsets`,{...operation.fields,status:'PAUSED'},draft.title);
  } else if(operation.action==='create_creative') {
    await verifyCreative(accountId,operation.fields);draft.title=`Create creative · ${operation.fields.name}`;step('creative',`${accountId}/adcreatives`,operation.fields,draft.title);
  } else if(operation.action==='create_ad') {
    await depend('adset',operation.fields.adset_id);await depend('creative',operation.fields.creative_id);
    const {creative_id,...rest}=operation.fields;draft.title=`Create ad · ${rest.name}`;step('ad',`${accountId}/ads`,{...rest,creative:{creative_id},status:'PAUSED'},draft.title);
  } else if(operation.action==='replace_creative') {
    const ad=await depend('ad',operation.id);if(ad.status==='ACTIVE')draft.warnings.push('This ad is currently ACTIVE. Replacing its creative can affect live delivery.');draft.title=`Replace creative · ${ad.name||ad.id}`;
    if(operation.creative){await verifyCreative(accountId,operation.creative);step('creative',`${accountId}/adcreatives`,operation.creative,'Create replacement creative');draft.steps[0].replaceAd=ad.id;}
    else {await depend('creative',operation.creative_id!);step('ad',ad.id,{creative:{creative_id:operation.creative_id}},draft.title);}
    change(`${ad.name||ad.id} · creative`,ad.creative,operation.creative||{creative_id:operation.creative_id});
    draft.warnings.push('This replaces this ad’s creative only. Meta may review the updated ad before delivery.');
  } else if(operation.action==='upload_image') {
    const bytes=Buffer.from(operation.bytes,'base64');
    if(bytes.length>2*1024*1024||(operation.mime==='image/png'?!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]!==255||bytes[1]!==216||bytes[2]!==255))throw new ManagementError('Use a valid JPEG or PNG image of up to 2 MB.');
    draft.title=`Upload image · ${operation.fileName}`;step('image',`${accountId}/adimages`,{bytes:operation.bytes,name:operation.fileName},draft.title);
    change('New account image',null,{name:operation.fileName,type:operation.mime,bytes:bytes.length});
  } else {
    safePublicUrl(operation.file_url);draft.title=`Upload video · ${operation.name}`;step('video',`${accountId}/advideos`,{title:operation.name,file_url:operation.file_url},draft.title);
    draft.warnings.push('Meta processes video after upload. Wait for it to be ready before attaching it to an ad.');
  }
  for(const s of draft.steps) {
    if(s.fields.status==='ACTIVE')draft.warnings.push('Enabling delivery can start spending immediately when the parent campaign, ad set and ad are active.');
    if(s.fields.daily_budget||s.fields.lifetime_budget||s.fields.bid_amount)draft.warnings.push(`Budgets and bids are in ${draft.currency}. A delivery budget is not an account spending limit.`);
    if(!draft.changes.length)for(const [key,value] of Object.entries(s.fields))if(key!=='bytes')change(s.label+' · '+key,null,value);
  }
  draft.warnings.push('The reviewed settings expire after ten minutes. Changes made in Meta or by a teammate require a fresh review.');
  if(!access.canWrite)draft.warnings.push(...access.reasons);
  draft.warnings=[...new Set(draft.warnings)];draft.digest=fingerprint({operation,draftId:draft.id,dependencies:draft.dependencies,steps:draft.steps});
  await saveDraft(draft);return draft;
}
function contains(actual:unknown,expected:unknown,key=''):boolean {
  if(expected&&typeof expected==='object') {
    if(!actual||typeof actual!=='object')return false;
    if(Array.isArray(expected))return Array.isArray(actual)&&actual.length===expected.length&&expected.every((v,i)=>contains(actual[i],v,key));
    return Object.entries(expected).every(([k,v])=>contains((actual as Record<string,unknown>)[k],v,k));
  }
  if((key==='start_time'||key==='end_time')&&typeof expected==='string'&&typeof actual==='string')return Date.parse(actual)===Date.parse(expected);
  return String(actual)===String(expected);
}
async function verifyStep(step:Step,accountId:string,result:Record<string,unknown>) {
  if(step.kind==='image') {
    const image=Object.values(result.images as Record<string,{hash?:string}>||{})[0];
    if(!image?.hash)throw new ManagementError('Meta did not return an image hash.');
    step.result={hash:image.hash};
    const read=await fetchGraph(`${accountId}/adimages`,{fields:'hash',hashes:JSON.stringify([image.hash])});
    if(!read.data?.some((i:{hash:string})=>i.hash===image.hash))throw new ManagementError('The uploaded image could not be verified.');return;
  }
  if(step.kind==='video') {
    if(!result.id)throw new ManagementError('Meta did not return the video ID.');
    const read=await fetchGraph(String(result.id),{fields:'id,status'});step.result={id:read.id,status:read.status};return;
  }
  const id=step.path.includes('/')?String(result.id||''):step.path;
  if(!/^\d+$/.test(id))throw new ManagementError('Meta did not return the new object ID.');
  step.result={id};
  const actual=await entity(step.kind,id,accountId);
  const expected={...step.fields};
  if(expected.creative)expected.creative={id:(expected.creative as {creative_id:string}).creative_id};
  if(!contains(actual,expected))throw new ManagementError('Meta accepted the request but its saved settings do not match the review.');
  step.result={id,name:actual.name,status:actual.status,effective_status:actual.effective_status};
}
export async function execute(accountId:string,id:string,owner:string,digest:string) {
  const stored=await readDraft(accountId,id);if(!stored)throw new ManagementError('This review was not found.');
  const draft=stored.draft;
  if(draft.owner!==owner)throw new ManagementError('Only the operator who prepared this review can apply it.');
  if(draft.state!=='review'||draft.digest!==digest)throw new ChangeConflict();
  if(Date.parse(draft.expiresAt)<=Date.now())throw new ManagementError('This review expired. Review the current settings again.');
  const access=await accountAccess(accountId);if(!access.canWrite)throw new ManagementError(access.reasons.join(' '));
  for(const d of draft.dependencies)if(fingerprint(await entity(d.kind,d.id,accountId))!==d.fingerprint)throw new ManagementError('Current settings have changed since this review. Reload and review again.');
  const release=await claimAccount(accountId,draft.id);
  try {
  // The account lease closes the race between this tool's separate reviews.
  for(const d of draft.dependencies)if(fingerprint(await entity(d.kind,d.id,accountId))!==d.fingerprint)throw new ManagementError('Current settings have changed since this review. Reload and review again.');
  draft.state='executing';draft.updatedAt=new Date().toISOString();let version=await saveDraft(draft,stored.version);
  const deadline=Date.now()+200000;
  for(let i=0;i<draft.steps.length;i++) {
    const step=draft.steps[i];
    if(Date.now()>deadline){draft.warnings.push('Stopped before the next write to preserve the execution record. Review remaining changes separately.');break;}
    step.state='submitting';version=await saveDraft(draft,version);
    try {
      const result=await postGraph(step.path,step.fields);
      step.result=step.kind==='image'?{images:result.images}:step.path.includes('/')?{id:result.id}:{id:step.path};
      version=await saveDraft(draft,version);
      await verifyStep(step,accountId,result);step.state='verified';
      if(step.replaceAd)draft.steps.push({kind:'ad',path:step.replaceAd,fields:{creative:{creative_id:step.result!.id}},label:'Attach replacement creative to this ad'});
      version=await saveDraft(draft,version);
    } catch(error) {
      step.state=step.result||(error as {uncertain?:boolean})?.uncertain?'unknown':'failed';
      step.error=step.state==='unknown'?'Meta may have applied this change. Check the returned object and Ads Manager before retrying.':'Meta rejected this step. Review its settings and account access in Ads Manager.';
      draft.warnings.push('Execution stopped. Completed steps were kept; later steps were not attempted. No writes were retried.');
      break;
    }
  }
  draft.state=draft.steps.every(s=>s.state==='verified')?'complete':draft.steps.some(s=>s.state==='verified')?'partial':draft.steps.some(s=>s.state==='unknown')?'uncertain':'failed';
  draft.updatedAt=new Date().toISOString();
  try{await saveDraft(draft,version);}catch{draft.warnings.push('The final receipt could not be stored. Keep these object IDs and check Ads Manager before another attempt.');}
  return draft;
  } finally {
    if(draft.state!=='executing'&&!draft.steps.some(s=>s.state==='unknown'))await release().catch(()=>{});
  }
}
/** Do not send uploaded bytes, Graph payloads or private fingerprint internals back to the browser. */
export function publicDraft(draft:Draft) {
  return {id:draft.id,accountId:draft.accountId,accountName:draft.accountName,currency:draft.currency,createdAt:draft.createdAt,expiresAt:draft.expiresAt,digest:draft.digest,state:draft.state,title:draft.title,changes:draft.changes,warnings:draft.warnings,steps:draft.steps.map(s=>({kind:s.kind,label:s.label,state:s.state,result:s.result,error:s.error})),updatedAt:draft.updatedAt};
}
