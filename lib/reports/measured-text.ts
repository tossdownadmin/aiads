import type {Metrics,Window} from './model';
import {cash,count,percent,ratio} from './daily-metrics';
import {maskReportingDates} from './daily-dates';
import {validateMeasurementUnit,validateMeasurementEntity} from './measurement-units';
export type EvidenceFact={id:string;periodId:string;display:string;value:unknown};
export type MeasurementEvidence={requireBindings?:boolean;account:{id:string;name:string;currency:string};periods:{id:string;window:Window;campaigns:{id:string;name:string}[]}[];facts:EvidenceFact[]};
export const VALIDATION_VERSION='measurement-v2';
export const labels: Partial<Record<keyof Metrics, string>> = {
  spend: "Spend",
  impressions: "Impressions",
  reach: "Reach",
  frequency: "Frequency",
  clicks: "Clicks",
  ctr: "CTR",
  cpc: "CPC",
  purchases: "Purchases",
  leads: "Leads",
  purchaseValue: "Attributed purchase value",
  roas: "Purchase ROAS",
  instagramVisits: "Instagram profile visits",
  facebookVisits: "Facebook Page visits",
  conversations: "Conversations",
  landingViews: "Landing page views",
  linkClicks: "Link clicks",
  thruplays: "ThruPlays",
  formLeads: "Instant-form leads",
  conversionLeads: "Converted leads",
  websitePurchases: "Website purchases",
  websiteAddsToCart: "Website adds to cart",
  websiteCheckouts: "Website checkouts initiated",
  postEngagement: "Post engagements",
  appInstalls: "App installs",
  websiteLeads: "Website leads",
  onMetaLeads: "On-Meta leads",
};
/** Numbers in narrative must be bound to scalar supplied measurements. */
export function renderMeasuredText(prose:string,cited:string[],facts:Map<string,EvidenceFact>,evidence:MeasurementEvidence,proposal=false){
  const tokens:{key:string;display:string}[]=[];
  const template=prose.replace(/\{\{([^{}]+)\}\}(%)?/g,(_match,id:string,suffix:string|undefined,offset:number)=>{
    const fact=resolveMeasuredFact(id,cited,facts,evidence.account.currency);
    const missingMetric=fact?.value===null&&/^window\d+:(?:(?:previous-)?account|(?:previous-)?campaign:[^:]+|ad(?:set)?:[^:]+):[^:]+$/.test(id)&&/Not reported|—/.test(fact.display.slice(fact.display.lastIndexOf(': ')+2));
    if(!fact||!missingMetric&&(typeof fact.value!=='number'||!Number.isFinite(fact.value)))throw Error('A measurement placeholder must bind a cited, supplied numeric metric or an explicitly unreported metric.');
    validateMeasurementUnit(prose,offset,_match.length,fact);
    validateMeasurementEntity(prose,offset,fact,evidence);
    const display=missingMetric?'Not reported':fact.display.slice(fact.display.lastIndexOf(': ')+2);
    if(suffix&&!id.endsWith(':ctr'))throw Error('A percentage suffix must use a supplied percentage metric.');
    const key='__MEASURE_'+String.fromCharCode(65+tokens.length)+'__';tokens.push({key,display});return key;
  });
  let checked=template;
  if(/[{}]/.test(checked))throw Error('Use double-brace exact evidence IDs for measurements.');
  // Digits inside exact supplied entity names/IDs identify the subject; they are
  // not licence to introduce a new quantitative claim.
  const entityIds=cited.flatMap(id=>{
    const value=facts.get(id)?.value;
    if(!/^window\d+:ad(?:set)?:[^:]+$/.test(id)||!value||typeof value!=='object')return [];
    const entity=value as Record<string,unknown>;
    return ['id','campaignId','adsetId'].flatMap(key=>typeof entity[key]==='string'?[entity[key] as string]:[]);
  });
  const identities=[evidence.account.name,evidence.account.id,...evidence.periods.flatMap(p=>p.campaigns.flatMap(c=>[c.name,c.id])),...entityIds,...evidence.facts.flatMap(f=>f.value&&typeof f.value==='object'&&'name' in f.value&&typeof f.value.name==='string'?[f.value.name]:[])].filter(v=>v.length>2).sort((a,b)=>b.length-a.length);
  for(const identity of identities)checked=checked.split(identity).join('ENTITY');
  // Dated window labels describe source metadata, not replacement KPI claims.
  // Previously even a correct "7-day review" was rejected by the digit guard.
  const period=evidence.periods.find(p=>cited.some(id=>id.startsWith(p.id+':')));
  if(period){
    const duration=Math.round((Date.parse(period.window.until)-Date.parse(period.window.since))/86400000)+1;
    checked=checked.replace(new RegExp('\\b'+duration+'(?:[- ]day(?:s)?|[- ]d)\\b','gi'),'REPORTING_PERIOD');
    const previous=facts.get(period.id+':previous-window')?.value as Window|undefined;
    // A flight date is metadata only when its delivery record is cited. Do not
    // turn arbitrary dates in names, ad copy or uncited schedules into evidence.
    const schedules=cited.flatMap(id=>{
      const value=facts.get(id)?.value;
      if(!/^window\d+:campaign:[^:]+:delivery$/.test(id)||!value||typeof value!=='object')return [];
      const {start,stop}=value as {start?:unknown;stop?:unknown};
      const isDay=(day:unknown):day is string=>typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day;
      return isDay(start)&&isDay(stop)&&start<=stop?[{since:start,until:stop}]:[];
    });
    checked=maskReportingDates(checked,[period.window,...(previous?.since&&previous.until?[previous]:[]),...schedules]);
  }
  if(proposal)checked=checked.replace(/\b(?:test|draft|prepare|produce|compare)\s+(?:[1-3]|one|two|three)(?:\s+(?:new|fresh))?\s+(?:creatives?|variants?|concepts?)\b/gi,'PROPOSED_CREATIVE_TEST');
  // An exact promotional offer in cited copy is source text, not a measured KPI.
  // Keep the whole unit-bearing phrase so "15% off" cannot justify "15% CTR".
  for(const id of cited){
    const value=facts.get(id)?.value as {copy?:unknown;approvedOffers?:unknown}|null;
    const texts=[...(Array.isArray(value?.copy)?value.copy:[]),value?.approvedOffers].filter((v):v is string=>typeof v==='string');
    for(const source of texts)for(const match of source.matchAll(/\b\d+(?:\.\d+)?\s*%\s*(?:off|discount)\b/gi)){
      const escaped=match[0].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      checked=checked.replace(new RegExp(escaped,'gi'),'SUPPLIED_PROMOTION');
    }
  }
  if(!evidence.requireBindings)checked=groundLiteralMeasurements(checked,cited,facts,evidence.account.currency);
  if(/\d/.test(checked)||/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand)\s+(?:purchases?|leads?|visits?|clicks?|conversations?|percent)\b/i.test(checked))throw Error('Unbound numeric claim in '+JSON.stringify(prose.slice(0,220))+'. Use a cited metric with its exact supplied value, or bind it with {{exact-evidence-id}}. Source-period labels are allowed; invented or ungrounded KPI values are not.');
  let rendered=template;for(const token of tokens)rendered=rendered.split(token.key).join(token.display);return rendered;
}

/** A typed ad metric resolves only to an existing stats field on its cited
 * parent. Whole objects, configuration settings and derived KPIs stay invalid. */
function resolveMeasuredFact(id:string,cited:string[],facts:Map<string,EvidenceFact>,currency:string):EvidenceFact|undefined{
  if(cited.includes(id)&&facts.has(id))return facts.get(id);
  const nested=id.match(/^(window\d+:ad(?:set)?:[^:]+):([^:]+)$/);
  if(!nested||!cited.includes(nested[1])||!Object.hasOwn(labels,nested[2]))return;
  const parent=facts.get(nested[1]),value=parent?.value as {stats?:Record<string,unknown>}|null;
  if(!parent||!value?.stats||!Object.hasOwn(value.stats,nested[2]))return;
  const metric=nested[2],measurement=value.stats[metric];
  if(measurement!==null&&(typeof measurement!=='number'||!Number.isFinite(measurement)))return;
  const display=measurement===null?'Not reported':['spend','cpc','purchaseValue'].includes(metric)?currency+' '+cash(measurement,currency):metric==='ctr'?percent(measurement):metric==='roas'?ratio(measurement):count(measurement);
  return {id,periodId:parent.periodId,value:measurement,display:labels[metric as keyof Metrics]+': '+display};
}

/** Accept ordinary metric wording only when both the metric and displayed value
 * match cited evidence. The model's placeholder syntax is not a reliability
 * dependency, and a number appearing somewhere in the input is insufficient. */
function groundLiteralMeasurements(prose:string,cited:string[],facts:Map<string,EvidenceFact>,currency:string){
  const aliases:Record<string,RegExp>={
    spend:/\b(?:spend|spent|budget used)\b/gi,impressions:/\bimpressions?\b/gi,reach:/\b(?:reach|people reached|people)\b/gi,
    frequency:/\b(?:frequency|freq)\b/gi,clicks:/\bclicks?\b/gi,ctr:/\b(?:ctr|click.through rate)\b/gi,cpc:/\b(?:cpc|cost per click)\b/gi,
    purchases:/\b(?:purchases?|orders?)\b/gi,leads:/\bleads?\b/gi,purchaseValue:/\b(?:purchase value|attributed revenue|reported revenue)\b/gi,
    roas:/\broas\b/gi,instagramVisits:/\b(?:(?:instagram|ig) (?:profile )?visits?|profile visits?)\b/gi,facebookVisits:/\b(?:(?:facebook|fb) (?:page |profile )?visits?|page visits?)\b/gi,
    conversations:/\b(?:conversations?|chats?)\b/gi,landingViews:/\blanding.page views?\b/gi,linkClicks:/\blink clicks?\b/gi,thruplays:/\bthruplays?\b/gi,
    'cost-per-result':/\b(?:cost|at|each|per result)\b/gi,
    'cost-per-purchase':/\b(?:cpa|cpp|cost per purchase|per purchase|at|each)\b/gi,'cost-per-lead':/\b(?:cpl|cost per lead|per lead|at|each)\b/gi,
    'cost-per-visit':/\b(?:cpv|cost per (?:page |profile )?visit|per visit|at|each)\b/gi,
    'cost-per-thruplay':/\b(?:cost per thruplays?|per thruplays?|cost per result|at|each)\b/gi,
    targetCpa:/\b(?:target cpa|cpa target|approved cpa)\b/gi,targetCpl:/\b(?:target cpl|cpl target|approved cpl)\b/gi,targetRoas:/\b(?:target roas|roas target|approved roas)\b/gi,
  };
  const numberFromDisplay=(display:string)=>Number(display.replace(/[^\d.+−-]/g,'').replace('−','-'));
  const shown=(key:string,value:number)=>numberFromDisplay(['spend','cpc','purchaseValue','cost-per-result','cost-per-purchase','cost-per-lead','targetCpa','targetCpl'].includes(key)?cash(value,currency):key==='ctr'?percent(value):key==='roas'||key==='targetRoas'?ratio(value):count(value));
  const values:{key:string;value:number;shown:number;percentChange?:boolean}[]=[];
  for(const id of cited){
    const fact=facts.get(id);if(!fact)continue;
    let key=id.split(':').at(-1)!;
    if(key==='cost-per-result'){
      const outcome=fact.display.split(' — cost per ').at(-1)?.split(': ')[0].toLowerCase()??'';
      key=/lead/.test(outcome)?'cost-per-lead':/purchase/.test(outcome)?'cost-per-purchase':/visit/.test(outcome)?'cost-per-visit':/thruplay/.test(outcome)?'cost-per-thruplay':key;
    }
    if(typeof fact.value==='number'&&aliases[key])values.push({key,value:fact.value,shown:numberFromDisplay(fact.display.slice(fact.display.lastIndexOf(': ')+2))});
    if(fact.value&&typeof fact.value==='object'){
      const object=fact.value as {stats?:Record<string,unknown>;percent?:Record<string,unknown>};
      for(const [metric,value] of Object.entries(object.stats??{}))if(typeof value==='number'&&aliases[metric])values.push({key:metric,value,shown:shown(metric,value)});
      for(const [metric,value] of Object.entries(object.percent??{}))if(typeof value==='number')values.push({key:metric==='costPerResult'?'cost-per-result':metric,value,shown:Number(value.toFixed(1)),percentChange:true});
    }
  }
  if(values.some(item=>item.key==='roas'&&item.value<1))prose=prose.replace(/\bROAS (?:is |was |remains )?(?:below|under|less than)\s*1(?:\.0+)?(?:[×x])?\b/gi,'VERIFIED_BELOW_REVENUE_SPEND_PARITY');
  const ranges:{start:number;end:number;key:string}[]=[];
  for(const [key,pattern] of Object.entries(aliases))for(const match of prose.matchAll(pattern))ranges.push({key,start:match.index!,end:match.index!+match[0].length});
  const numeric=/(?:(?:CAD|USD|PKR)\s*)?(?:[$₨]\s*)?[+−-]?\d[\d,]*(?:\.\d+)?(?:\s*[%×x])?/g;
  return prose.replace(numeric,(token:string,offset:number)=>{
    const amount=Number(token.replace(/[A-Z$₨,%×x\s]/g,'').replace('−','-'));
    if(!Number.isFinite(amount))return token;
    const nearest=ranges.map(range=>({...range,distance:range.end<=offset?offset-range.end:range.start>=offset+token.length?range.start-offset-token.length:0})).sort((a,b)=>a.distance-b.distance);
    const after=prose.slice(offset+token.length);
    // A count followed by its noun must match that outcome, not a nearby spend.
    const noun=after.match(/^\s*(purchases?|orders?|leads?|impressions?|clicks?|conversations?|thruplays?)\b/i)?.[1]?.toLowerCase();
    const forced=noun?(/purchase|order/.test(noun)?'purchases':noun.replace(/s$/,'')==='lead'?'leads':noun.replace(/s$/,'')==='impression'?'impressions':noun.replace(/s$/,'')==='click'?'clicks':noun.replace(/s$/,'')==='conversation'?'conversations':'thruplays'):undefined;
    const matched=values.some(item=>{
      if(forced&&item.key!==forced)return false;
      const distance=nearest.find(range=>range.key===item.key)?.distance??Infinity;
      if(distance>28)return false;
      if(!forced&&nearest[0]&&nearest[0].distance+8<distance)return false;
      if(item.percentChange&&!token.includes('%'))return false;
      if(!item.percentChange&&token.includes('%')&&item.key!=='ctr')return false;
      const source=item.percentChange&&amount>=0?Math.abs(item.value):item.value;
      const displayed=item.percentChange&&amount>=0?Math.abs(item.shown):item.shown;
      return source===amount||displayed===amount;
    });
    return matched?'VERIFIED_MEASUREMENT':token;
  });
}

