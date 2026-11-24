import { z } from 'zod';
export class ManagementError extends Error {}

export const accountId = z.string().regex(/^act_\d+$/);
export const objectId = z.string().regex(/^\d+$/);
const name = z.string().trim().min(1).max(200);
const amount = z.string().regex(/^[1-9]\d{0,11}$/,'Use a positive budget in the account’s smallest currency unit.');
const status = z.enum(['PAUSED','ACTIVE']);
const jsonObject = z.record(z.unknown()).refine(v=>JSON.stringify(v).length<=50000,'Settings are too large.');
const schedule = z.string().datetime({offset:true});
export const objectives = ['OUTCOME_AWARENESS','OUTCOME_TRAFFIC','OUTCOME_ENGAGEMENT','OUTCOME_LEADS','OUTCOME_APP_PROMOTION','OUTCOME_SALES'] as const;
export const campaignFields = z.object({name:name.optional(),status:status.optional(),daily_budget:amount.optional(),lifetime_budget:amount.optional(),bid_strategy:z.enum(['LOWEST_COST_WITHOUT_CAP','LOWEST_COST_WITH_BID_CAP','COST_CAP','LOWEST_COST_WITH_MIN_ROAS']).optional(),spend_cap:amount.optional()}).strict();
export const adsetFields = z.object({name:name.optional(),status:status.optional(),daily_budget:amount.optional(),lifetime_budget:amount.optional(),bid_amount:amount.optional(),bid_strategy:campaignFields.shape.bid_strategy,start_time:schedule.optional(),end_time:schedule.optional(),targeting:jsonObject.optional(),optimization_goal:z.string().regex(/^[A-Z_]+$/).max(80).optional(),billing_event:z.string().regex(/^[A-Z_]+$/).max(80).optional(),promoted_object:jsonObject.optional(),attribution_spec:z.array(jsonObject).max(5).optional(),destination_type:z.string().regex(/^[A-Z_]+$/).max(80).optional()}).strict();
export const adFields = z.object({name:name.optional(),status:status.optional()}).strict();
export const creativeFields = z.object({name,object_story_id:z.string().regex(/^\d+_\d+$/).optional(),object_story_spec:jsonObject.optional(),url_tags:z.string().max(2000).optional()}).strict().refine(v=>Boolean(v.object_story_id)!==Boolean(v.object_story_spec),'Choose an existing post or supply new creative content.');
const campaignCreate = campaignFields.omit({status:true}).extend({name,objective:z.enum(objectives),special_ad_categories:z.array(z.enum(['HOUSING','EMPLOYMENT','FINANCIAL_PRODUCTS_SERVICES'])).max(3).default([])}).strict();
const adsetCreate = adsetFields.omit({status:true}).extend({name,campaign_id:objectId,targeting:jsonObject,optimization_goal:z.string().regex(/^[A-Z_]+$/),billing_event:z.string().regex(/^[A-Z_]+$/)}).strict();
export const operationSchema = z.union([
  z.object({action:z.literal('update'),kind:z.enum(['campaign','adset','ad']),id:objectId,fields:jsonObject}).strict(),
  z.object({action:z.literal('status'),targets:z.array(z.object({kind:z.enum(['campaign','adset','ad']),id:objectId,status}).strict()).min(1).max(25)}).strict(),
  z.object({action:z.literal('create_campaign'),fields:campaignCreate}).strict(),
  z.object({action:z.literal('create_adset'),fields:adsetCreate}).strict(),
  z.object({action:z.literal('create_creative'),fields:creativeFields}).strict(),
  z.object({action:z.literal('create_ad'),fields:z.object({name,adset_id:objectId,creative_id:objectId}).strict()}).strict(),
  z.object({action:z.literal('replace_creative'),id:objectId,creative_id:objectId.optional(),creative:creativeFields.optional()}).strict().refine(v=>Boolean(v.creative_id)!==Boolean(v.creative),'Choose an existing creative or create a replacement.'),
  z.object({action:z.literal('upload_image'),fileName:name,bytes:z.string().min(8).max(2800000).regex(/^[A-Za-z0-9+/]+={0,2}$/),mime:z.enum(['image/jpeg','image/png'])}).strict(),
  z.object({action:z.literal('upload_video'),name,file_url:z.string().url().max(2000)}).strict(),
]);
export type Operation = z.infer<typeof operationSchema>;
export type Kind = 'campaign'|'adset'|'ad'|'creative';
export type Entity = Record<string, unknown> & {id:string;name?:string;account_id?:string};
export type Change = {label:string;before:unknown;after:unknown};
export type Step = {kind:Kind|'image'|'video';path:string;fields:Record<string,unknown>;label:string;replaceAd?:string;result?:Record<string,unknown>;state?:'submitting'|'verified'|'failed'|'unknown';error?:string};
export type ReadDependency = {kind:Kind;id:string;fingerprint:string};
export type Draft = {id:string;accountId:string;currency:string;accountName:string;owner:string;createdAt:string;expiresAt:string;digest:string;state:'review'|'executing'|'complete'|'partial'|'failed'|'uncertain';title:string;operation:Operation;changes:Change[];warnings:string[];dependencies:ReadDependency[];steps:Step[];updatedAt?:string};

export function majorToMinor(value:string,currency:string) {
  const digits = new Intl.NumberFormat('en',{style:'currency',currency}).resolvedOptions().maximumFractionDigits ?? 2;
  const match=value.trim().match(/^(\d+)(?:\.(\d+))?$/);
  if(!match || (match[2]?.length||0)>digits) throw new Error(`Use at most ${digits} decimal places for ${currency}.`);
  const minor=BigInt(match[1]+(match[2]||'').padEnd(digits,'0')).toString();
  return amount.parse(minor);
}
export function displayMoney(value:unknown,currency:string) {
  if(value===null||value===undefined||value==='')return '—';
  const digits=new Intl.NumberFormat('en',{style:'currency',currency}).resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat('en',{style:'currency',currency}).format(Number(value)/10**digits);
}
