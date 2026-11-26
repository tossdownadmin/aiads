import type { MetaAccount } from '../meta/read';
import { accountToday, previousWindow as priorWindow, validDay, type Window } from '../reports/model';
import { hasCurrentApproval, type DailyClientContext } from '../reports/client-context';
import { add, compare, decimal, divide, formatDecimal, formatMoney, multiply, subtract, sum } from './decimal';
import { monitoringSkill } from './skill';
import type { Check, Evidence, Finding, MonitorSnapshot, Period, Row, RuleState, SourceKey, Sources } from './types';

export const outcomeLabels:Record<string,string>={purchases:'Purchases',leads:'Leads',instagramVisits:'Instagram profile visits',facebookVisits:'Facebook Page visits',conversations:'Conversations started',thruplays:'ThruPlays',reach:'Reach',landingViews:'Landing page views',linkClicks:'Link clicks'};
const actions:Record<string,string[]>={purchases:['omni_purchase','purchase','offsite_conversion.fb_pixel_purchase'],leads:['lead','onsite_conversion.lead_grouped','offsite_conversion.fb_pixel_lead'],instagramVisits:['onsite_conversion.instagram_profile_visit','instagram_profile_visit'],facebookVisits:['onsite_conversion.facebook_profile_visit','facebook_profile_visit','page_visit'],conversations:['onsite_conversion.messaging_conversation_started_7d','messaging_conversation_started_7d'],landingViews:['landing_page_view','omni_landing_page_view'],linkClicks:['link_click'],thruplays:['video_view']};
function actionValue(value:unknown,types:string[]) {
  if(!Array.isArray(value))return {value:null,field:'unreported action'};
  for(const type of types) {
    const matches=value.filter(v=>v&&typeof v==='object'&&v.action_type===type);
    if(matches.length)return {value:matches.length===1?decimal(matches[0].value):null,field:'action_type='+type};
  }
  return {value:null,field:'unreported action'};
}

export function evaluateMonitor(input:{id:string;account:MetaAccount;period:Period;window:Window;previous:Window;sources:Sources;context:DailyClientContext|null;contextError?:boolean;startedAt:string;now?:Date}):MonitorSnapshot {
  const {account,period,window,previous,sources}=input,method=monitoringSkill(),now=input.now||new Date(),today=accountToday(account.timezone,now);
  const expectedPrior=priorWindow(window),days=(Date.parse(window.until)-Date.parse(window.since))/86400000+1;
  if(!validDay(window.since)||!validDay(window.until)||window.until>=today||days!==(period==='7d'?7:30)||previous.since!==expectedPrior.since||previous.until!==expectedPrior.until)throw Error('Monitoring requires equal-length, nonoverlapping completed windows.');
  const evidence:Evidence[]=[],checks:Check[]=[],findings:Finding[]=[],limitations:string[]=[];
  const context=input.context?.accountId===account.id&&input.context.currency===account.currency?input.context:null;
  if(input.context&&!context)limitations.push('Saved business context has a different account or currency and was ignored.');
  const link='/campaigns?account='+account.id;
  function rows(key:SourceKey,range?:Window):Row[]|null {
    const source=sources[key];
    if(source.state!=='available'||!source.data){limitations.push(key+': '+(source.reason||'unavailable'));return null;}
    const seen=new Set<string>();
    for(const row of source.data) {
      const id=String(range?(row.ad_id||row.campaign_id||row.account_id):row.id);
      if(seen.has(id)||!/^\d+$/.test(id.replace(/^act_/,''))||
        (range&&(String(row.account_id)!==account.id.slice(4)||row.account_currency!==account.currency||row.date_start!==range.since||row.date_stop!==range.until))||
        (range&&['spend','impressions','reach','frequency','clicks','ctr','cpc'].some(k=>row[k]!==undefined&&decimal(row[k])===null))) {
        limitations.push(key+': source identity, dates, currency, uniqueness or numeric fields did not validate.');return null;
      }
      seen.add(id);
    }
    if((key==='account'||key==='nativeScore')&&(source.data.length!==1||source.data[0].id!==account.id)){limitations.push(key+': account identity mismatch.');return null;}
    if(key==='account'&&source.data.some(row=>row.currency!==account.currency||row.timezone_name!==account.timezone)){limitations.push('Account currency or timezone changed; rediscover the connection before refreshing.');return null;}
    return source.data;
  }
  const config=rows('account'),campaignInventory=rows('campaigns'),adsets=rows('adsets'),ads=rows('ads');
  const current=rows('currentAccount',window),campaigns=rows('currentCampaigns',window),currentAds=rows('currentAds',window);
  const prior=rows('previousAccount',previous),priorCampaigns=rows('previousCampaigns',previous),priorAds=rows('previousAds',previous);
  const monthWindow={since:window.until.slice(0,7)+'-01',until:window.until},month=rows('monthAccount',monthWindow);
  const one=(value:Row[]|null)=>value?.length===1?value[0]:null;
  function fact(source:SourceKey|'profile',periodName:string,scope:Evidence['scope'],id:string,name:string,metric:string,label:string,value:string|null,field:string,unit:Evidence['unit'],range:Window|null,derived?:{formula:string;inputs:string[]}) {
    const item:Evidence={id:[periodName,scope,id,metric].join(':'),label,metric,value,unit,entityId:id,entityName:name,scope,source,field,retrievedAt:source==='profile'?context?.updatedAt||input.startedAt:sources[source].retrievedAt,window:range,...(unit==='currency'?{currency:account.currency}:{}),...derived};
    if(evidence.some(f=>f.id===item.id))throw Error('Duplicate monitoring evidence');
    evidence.push(item);return item;
  }
  function metrics(source:SourceKey,periodName:string,scope:Evidence['scope'],row:Row|null,range:Window,id=account.id,name=account.name) {
    const out:Record<string,Evidence>={};
    for(const metric of ['spend','impressions','reach','frequency','clicks','ctr','cpc'])out[metric]=fact(source,periodName,scope,id,name,metric,({ctr:'CTR (all clicks)',cpc:'CPC (all clicks)'} as Record<string,string>)[metric]||metric[0].toUpperCase()+metric.slice(1),decimal(row?.[metric]),metric,metric==='spend'||metric==='cpc'?'currency':metric==='ctr'?'percent':metric==='frequency'?'ratio':'count',range);
    for(const [metric,types] of Object.entries(actions)) {
      const origin=metric==='thruplays'?'video_thruplay_watched_actions':'actions',action=actionValue(row?.[origin],types);
      out[metric]=fact(source,periodName,scope,id,name,metric,outcomeLabels[metric],action.value,origin+':'+action.field,'count',range);
    }
    const purchase=actionValue(row?.action_values,actions.purchases);
    out.purchaseValue=fact(source,periodName,scope,id,name,'purchaseValue','Attributed purchase value',purchase.value,'action_values:'+purchase.field,'currency',range);
    out.roas=fact(source,periodName,scope,id,name,'roas','Calculated purchase ROAS',out.spend.value&&out.purchaseValue.value!==null?divide(out.purchaseValue.value,out.spend.value):null,'derived','ratio',range,{formula:'attributed purchase value / spend',inputs:[out.purchaseValue.id,out.spend.id]});
    return out;
  }
  const c=metrics('currentAccount','current','account',one(current),window),p=metrics('previousAccount','previous','account',one(prior),previous),m=metrics('monthAccount','month','account',one(month),monthWindow);
  // Preserve all campaign evidence, including campaigns no longer active.
  const campaignFacts=(campaigns||[]).map(row=>metrics('currentCampaigns','current','campaign',row,window,String(row.campaign_id),String(row.campaign_name||row.campaign_id)));
  const campaignSpend=campaigns&&campaignFacts.every(row=>row.spend.value!==null)?sum(campaignFacts.map(row=>row.spend.value!)):null;
  const rollup=fact('currentCampaigns','current','account',account.id,account.name,'campaignSpendSum','Sum of campaign spend',campaignSpend,'spend','currency',window,{formula:'sum of all campaign spend',inputs:campaignFacts.map(row=>row.spend.id)});
  const delta=fact('currentCampaigns','current','account',account.id,account.name,'reconciliationDelta','Campaign sum less account spend',campaignSpend!==null&&c.spend.value!==null?subtract(campaignSpend,c.spend.value):null,'derived','currency',window,{formula:'campaign spend sum - account spend',inputs:[rollup.id,c.spend.id]});
  let integrity:MonitorSnapshot['integrity']=delta.value===null||!config?'unavailable':compare(delta.value,'0')===0?'verified':'mismatch';
  const check=(id:string,state:RuleState,detail:string,refs:Evidence[]=[]):Check=>{
    const rule=method.rules.find(r=>r.id===id);if(!rule)throw Error('Unregistered monitoring rule');
    const result={...rule,state,detail,evidenceIds:refs.map(e=>e.id)};checks.push(result);return result;
  };
  function issue(ruleId:string,title:string,explanation:string,nextStep:string,refs:Evidence[],priority:Finding['priority'],category:Finding['category'],entityId=account.id,entityName=account.name,href=link) {
    findings.push({id:[ruleId,entityId,period].join(':'),ruleId,accountId:account.id,entityId,entityName,priority,category,title,explanation,nextStep,evidenceIds:refs.map(e=>e.id),href});
  }
  check('source-reconciliation',integrity==='verified'?'pass':integrity==='mismatch'?'fail':'unknown',integrity==='verified'?'Native account spend matches the exact campaign sum.':integrity==='mismatch'?'Account spend and campaign spend differ; the score is withheld.':'A complete account/campaign source comparison is unavailable.',[c.spend,rollup,delta]);
  if(integrity!=='verified')issue('source-reconciliation',integrity==='mismatch'?'Spend sources do not reconcile':'Verify source coverage','Account spend: '+formatMoney(c.spend.value,account.currency)+'. Campaign sum: '+formatMoney(rollup.value,account.currency)+'.','Refresh the same completed dates, then compare the source rows in Ads Manager before making a spend decision.',[c.spend,rollup,delta],integrity==='mismatch'?'critical':'high','measurement');
  const status=config?decimal(config[0].account_status):null,statusFact=fact('account','current','account',account.id,account.name,'accountStatus','Current account status',status,'account_status','status',null);
  check('account-delivery',status===null?'unknown':status==='1'?'pass':'fail','Account status is current configuration at retrieval, not historical delivery.',[statusFact]);
  if(status&&status!=='1')issue('account-delivery','Account needs a delivery check','Meta returned account status '+status+'.','Review restrictions, payment state and account messages in Ads Manager. Do not infer the cause from spend alone.',[statusFact],'critical','delivery');
  const disapproved=(ads||[]).filter(ad=>ad.effective_status==='DISAPPROVED');
  const adCount=fact('ads','current','account',account.id,account.name,'disapprovedAds','Ads currently disapproved',ads?String(disapproved.length):null,'effective_status=DISAPPROVED','count',null);
  check('ad-policy',!ads?'unknown':disapproved.length?'fail':!ads.length?'not_applicable':'pass','Current ad approval state; parent pauses and historical spend are assessed separately.',[adCount]);
  for(const ad of disapproved)issue('ad-policy','Review a disapproved ad',String(ad.name||ad.id)+' is currently disapproved.','Inspect the policy reason and creative in Meta before editing or requesting review.',[adCount],'high','delivery',String(ad.id),String(ad.name||ad.id));
  const approved=!!context&&hasCurrentApproval(context,today)&&context.approvedOn!<=window.since&&context.validUntil!>=window.until;
  const gaps=[!context?.businessGoal&&'business goal',!context?.primaryOutcome&&'primary outcome',!context?.conversionDefinition&&'conversion definition',!approved&&'current owner approval covering the reporting period'].filter(Boolean);
  check('client-readiness',input.contextError?'unknown':gaps.length?'fail':'pass',input.contextError?'Saved business context could not be read.':gaps.length?'Missing '+gaps.join(', ')+'.':'Saved outcome and approval apply to this account, currency and period.');
  if(gaps.length||input.contextError)issue('client-readiness','Complete the account decision profile',input.contextError?'Saved context could not be read.':'Needed: '+gaps.join(', ')+'.','Confirm the account goal, outcome definition, targets, budget and approval with the account owner.',[],'medium','readiness',account.id,account.name,'/?account='+account.id+'&view=profile');
  const outcome=context?.primaryOutcome,label=outcome?outcomeLabels[outcome]:'Primary outcome',result=outcome?c[outcome]:undefined,previousResult=outcome?p[outcome]:undefined;
  check('outcome-availability',!outcome?'unknown':result?.value===null?'unknown':'pass',!outcome?'Select an explicit primary outcome in the business profile.':result?.value===null?'The named action was not returned. This does not establish zero results or broken tracking.':label+' is explicitly reported in the account source.',result?[result]:[]);
  if(outcome&&result?.value===null)issue('outcome-availability','Primary outcome is unreported',label+' was not returned at account level.','Verify the action definition, scope and attribution in Ads Manager. Use account/campaign evidence without substituting a different outcome.',[result],'high','measurement');
  const cost=(current:boolean)=>{
    const metric=current?result:previousResult,spend=current?c.spend:p.spend;
    return fact(current?'currentAccount':'previousAccount',current?'current':'previous','account',account.id,account.name,'costPerResult','Blended cost per '+label.toLowerCase(),metric?.value!==undefined&&metric.value!==null&&spend.value!==null?divide(spend.value,metric.value):null,'derived','currency',current?window:previous,{formula:'all account spend / account '+(outcome||'unselected outcome'),inputs:[spend.id,...(metric?[metric.id]:[])]});
  };
  const currentCost=cost(true),previousCost=cost(false);
  const targetNumber=context?.targetCostPerResult??(outcome==='purchases'?context?.targetCpa:outcome==='leads'?context?.targetCpl:undefined),target=targetNumber===undefined?null:decimal(String(targetNumber));
  const targetFact=fact('profile','profile','account',account.id,account.name,'costTarget','Approved blended account cost target',approved?target:null,'targetCostPerResult / targetCpa / targetCpl','currency',null);
  const enough=!!result?.value&&compare(result.value,method.thresholds.minimumOutcomes)>=0;
  const zeroResult=!!result&&result.value==='0'&&c.spend.value!==null&&target!==null&&compare(c.spend.value,multiply(target,method.thresholds.minimumOutcomes))>=0;
  const roasTarget=outcome==='purchases'&&target===null&&approved&&context?.targetRoas?decimal(String(context.targetRoas)):null;
  const roasTargetFact=fact('profile','profile','account',account.id,account.name,'roasTarget','Approved account purchase ROAS target',roasTarget,'targetRoas','ratio',null);
  const targetState:RuleState=roasTarget!==null?(!enough||c.roas.value===null?'unknown':compare(c.roas.value,roasTarget)<0?'review':'pass'):!approved||!outcome||target===null?'unknown':zeroResult?'review':!enough||currentCost.value===null?'unknown':compare(currentCost.value,target)>0?'review':'pass';
  const targetRefs=roasTarget!==null?[c.roas,roasTargetFact,...(result?[result]:[])]:[currentCost,targetFact,...(result?[result]:[])];
  check('cost-target',targetState,!approved||target===null&&roasTarget===null?'A matching approved account cost or purchase ROAS target is required.':!enough&&!zeroResult?'At least '+method.thresholds.minimumOutcomes+' reported outcomes are required for this configured sample gate.':'Blended account spend; a minimum of '+method.thresholds.minimumOutcomes+' outcomes is required. This does not compare campaigns with different objectives.',targetRefs);
  if(!gaps.length&&target===null&&roasTarget===null)issue('cost-target','Confirm an approved account target','The profile has a primary outcome, but no applicable approved cost or purchase ROAS target.','Confirm the account-level target with its owner, then update the business profile. Leave an unknown target blank.',targetRefs,'medium','readiness');
  if(targetState==='review')issue('cost-target',roasTarget!==null?'Review account purchase ROAS':'Review blended account cost',roasTarget!==null?'Calculated account purchase ROAS: '+formatDecimal(c.roas.value,2)+'×. Approved account target: '+formatDecimal(roasTarget,2)+'×.':zeroResult?'Meta explicitly returned zero '+label.toLowerCase()+' with '+formatMoney(c.spend.value,account.currency)+' account spend.':'Blended cost: '+formatMoney(currentCost.value,account.currency)+'. Approved account target: '+formatMoney(target,account.currency)+'.','Check the account spend mix, attribution, conversion quality and campaign objectives before proposing any budget change.',[...targetRefs,c.spend],'high','performance');
  const budget=approved&&context?.monthlyBudget&&context.budgetMonth===monthWindow.since.slice(0,7)?decimal(String(context.monthlyBudget)):null;
  const budgetFact=fact('profile','profile','account',account.id,account.name,'monthlyBudget','Approved monthly account budget',budget,'monthlyBudget','currency',monthWindow);
  const usage=fact('monthAccount','month','account',account.id,account.name,'budgetUsed','Monthly budget used',budget&&m.spend.value!==null?divide(multiply(m.spend.value,'100'),budget):null,'derived','percent',monthWindow,{formula:'month-to-date spend / monthly budget × 100',inputs:[m.spend.id,budgetFact.id]});
  const budgetState:RuleState=budget===null||m.spend.value===null?'unknown':compare(m.spend.value,budget)>0?'fail':'pass';
  check('budget-usage',budgetState,budget===null?'An approved budget for the matching month is required.':m.spend.value===null?'Month-to-date account spend was not returned.':'Actual completed-day usage; no straight-line pacing or month-end forecast is assumed.',[m.spend,budgetFact,usage]);
  if(!gaps.length&&budget===null)issue('budget-usage','Confirm the applicable monthly budget','No approved budget for the source month is available.','Confirm the budget, its month and approval with the account owner before assessing utilization.',[budgetFact],'medium','readiness');
  if(budgetState==='fail')issue('budget-usage','Approved monthly budget exceeded',formatMoney(m.spend.value,account.currency)+' reported month-to-date against '+formatMoney(budget,account.currency)+' approved.','Check for an approved budget revision with the account owner, then review current campaign budgets.',[m.spend,budgetFact,usage],'high','budget');
  const enoughPrevious=!!previousResult?.value&&compare(previousResult.value,method.thresholds.minimumOutcomes)>=0;
  const priorSpends=priorCampaigns?.map(row=>decimal(row.spend)),priorReconciles=!!priorSpends&&priorSpends.every((v):v is string=>v!==null)&&p.spend.value!==null&&compare(sum(priorSpends as string[]),p.spend.value)===0;
  const trendState:RuleState=integrity!=='verified'||!outcome||!enough||!enoughPrevious||!priorReconciles||currentCost.value===null||previousCost.value===null||previousCost.value==='0'?'unknown':compare(currentCost.value,multiply(previousCost.value,method.thresholds.costIncrease))>=0?'review':'pass';
  check('efficiency-trend',trendState,'Configured signal: at least '+method.thresholds.minimumOutcomes+' outcomes per period, reconciled spend, and current cost at least '+method.thresholds.costIncrease+'× previous cost. This is an investigation threshold, not a universal benchmark.',[currentCost,previousCost]);
  if(trendState==='review')issue('efficiency-trend','Blended result cost increased','Current: '+formatMoney(currentCost.value,account.currency)+'. Previous: '+formatMoney(previousCost.value,account.currency)+'.','Compare campaign spend mix and result quality across these exact periods. This signal does not identify a cause or authorize an edit.',[currentCost,previousCost],'medium','performance');
  const goals=new Map((adsets||[]).map(set=>[String(set.id),String(set.optimization_goal)])),priorById=new Map((priorAds||[]).map(ad=>[String(ad.ad_id),ad]));
  let eligible=0,shifts=0;
  for(const ad of currentAds||[]) {
    if(!['LINK_CLICKS','LANDING_PAGE_VIEWS','PROFILE_VISIT'].includes(goals.get(String(ad.adset_id))||''))continue;
    const old=priorById.get(String(ad.ad_id));if(!old)continue;
    const required=['impressions','frequency','ctr'] as const;
    if(required.some(k=>decimal(ad[k])===null||decimal(old[k])===null))continue;
    if(compare(decimal(ad.impressions)!,method.thresholds.creativeImpressions)<0||compare(decimal(old.impressions)!,method.thresholds.creativeImpressions)<0||decimal(old.ctr)==='0'||decimal(old.frequency)==='0')continue;
    eligible++;
    if(compare(decimal(ad.frequency)!,multiply(decimal(old.frequency)!,method.thresholds.frequencyIncrease))<0||compare(decimal(ad.ctr)!,multiply(decimal(old.ctr)!,method.thresholds.ctrDecrease))>0)continue;
    shifts++;const id=String(ad.ad_id),name=String(ad.ad_name||id),a=metrics('currentAds','current','ad',ad,window,id,name),b=metrics('previousAds','previous','ad',old,previous,id,name);
    issue('creative-engagement','Review an ad engagement shift','CTR: '+formatDecimal(a.ctr.value,2)+'% versus '+formatDecimal(b.ctr.value,2)+'%. Frequency: '+formatDecimal(a.frequency.value,2)+' versus '+formatDecimal(b.frequency.value,2)+'.','Inspect the current creative and any edits between periods. This is a traffic-goal review signal, not proof of fatigue or a reason to pause automatically.',[a.ctr,b.ctr,a.frequency,b.frequency,a.impressions,b.impressions],'medium','creative',id,name);
  }
  check('creative-engagement',!adsets||!currentAds||!priorAds?'unknown':!eligible?'not_applicable':shifts?'review':'pass','Configured signal: traffic-goal ads with at least '+method.thresholds.creativeImpressions+' impressions in each period, frequency at least '+method.thresholds.frequencyIncrease+'× previous and CTR at most '+method.thresholds.ctrDecrease+'× previous. This does not prove fatigue or historical creative identity.');
  const scoreSource=rows('nativeScore'),rawScore=scoreSource?.[0]?.opportunity_score,native=decimal(typeof rawScore==='number'&&Number.isFinite(rawScore)?String(rawScore):rawScore);
  const nativeScore=native!==null&&compare(native,'0')>=0&&compare(native,'100')<=0?native:null;
  if(nativeScore===null)limitations.push('Meta did not return a valid native Opportunity Score; it is unavailable, not zero.');
  if(!campaignInventory)limitations.push('Current campaign inventory is unavailable; reporting rows remain distinct from configuration.');
  const applicable=checks.filter(c=>c.state!=='not_applicable'),evaluated=applicable.filter(c=>c.state!=='unknown'),weight=sum(applicable.map(c=>String(c.weight)));
  const earned=sum(evaluated.map(c=>multiply(String(c.weight),c.state==='pass'?'1':c.state==='review'?'0.5':'0')));
  const score=integrity==='verified'&&applicable.length===evaluated.length&&compare(weight,'0')>0?Number(divide(multiply(earned,'100'),weight,0)):null;
  return {schema:'meta-monitor-v1',id:input.id,account,period,window,previousWindow:previous,startedAt:input.startedAt,completedAt:now.toISOString(),skill:{name:method.name,version:method.version,hash:method.hash},context,contextError:!!input.contextError,sources,evidence,checks,findings,score,coverage:{evaluated:evaluated.length,applicable:applicable.length,percent:applicable.length?Math.floor(evaluated.length/applicable.length*100):0},integrity,nativeScore,limitations:[...new Set([...limitations,'Meta-attributed outcomes are not reconciled sales, qualified leads or profit.','Recent attributed results can change as Meta processes conversions.'])]};
}
