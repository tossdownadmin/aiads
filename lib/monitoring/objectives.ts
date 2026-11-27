import {compare,decimal,sum} from './decimal';
import type {Row} from './types';

import {configuredOutcome} from '../meta/objectives';
export {configuredOutcome} from '../meta/objectives';

export function campaignConfiguration(campaign:Row,sets:Row[]|null,ads:Row[]|null) {
  const id=String(campaign.campaign_id),spend=decimal(campaign.spend);
  const reportingAds=ads?.filter(ad=>String(ad.campaign_id)===id),values=reportingAds?.map(ad=>decimal(ad.spend));
  const complete=!!sets&&!!values&&values.every((v):v is string=>v!==null)&&spend!==null&&compare(sum(values as string[]),spend)===0;
  const delivering=reportingAds?.filter(ad=>{const s=decimal(ad.spend),i=decimal(ad.impressions);return s!==null&&compare(s,'0')>0||i!==null&&compare(i,'0')>0;})||[];
  const ids=[...new Set(delivering.map(ad=>String(ad.adset_id)))];
  const selected=ids.map(id=>sets?.find(set=>String(set.id)===id&&String(set.campaign_id)===String(campaign.campaign_id)));
  const goals=[...new Set(selected.map(set=>String(set?.optimization_goal||'Unreported')))];
  const events=[...new Set(selected.flatMap(set=>{const value=(set?.promoted_object as Row|undefined)?.custom_event_type;return typeof value==='string'?[value]:[];}))];
  if(!complete||!ids.length||selected.some(set=>!set))return {goals,events,outcome:null,state:'unavailable' as const,detail:'Delivering ad-set settings and campaign/ad spend coverage could not be matched completely.'};
  const mapped=selected.map(set=>configuredOutcome(set!)),unique=[...new Set(mapped.filter(Boolean).map(value=>value!.metric))];
  if(mapped.some(value=>!value))return {goals,events,outcome:null,state:'unsupported' as const,detail:'Meta returned these goals, but the exact optimized event or platform metric is not supported by this source read. No substitute result is used.'};
  if(unique.length!==1)return {goals,events,outcome:null,state:'mixed' as const,detail:'Delivering ad sets have different result types. Their outcomes and costs are kept separate.'};
  return {goals,events,outcome:mapped[0]!,state:'reported' as const,detail:'Outcome selected from current settings for the ad sets with delivery in these dates. Current settings do not prove historical configuration.'};
}
