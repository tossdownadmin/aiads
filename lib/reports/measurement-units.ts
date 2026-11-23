import type {EvidenceFact,MeasurementEvidence} from './measured-text';

const units:[string[],RegExp][]=[
  [['cost-per-lead','cost-per-purchase','cost-per-thruplay','cost-per-visit','cost-per-result','targetCostPerResult'],/\bcost per result\b/gi],
  [['cost-per-lead'],/\b(?:cpl|cost per lead)\b/gi],
  [['cost-per-purchase'],/\b(?:cpa|cpp|cost per purchase|cost per order)\b/gi],
  [['cost-per-thruplay'],/\bcost per thruplays?\b/gi],
  [['cost-per-visit'],/\b(?:cpv|cost per (?:profile |page )?visit)\b/gi],
  [['purchaseValue'],/\b(?:attributed revenue|purchase value|reported revenue)\b/gi],
  [['instagramVisits'],/\b(?:instagram|ig) (?:profile )?visits?\b/gi],
  [['facebookVisits'],/\b(?:facebook|fb) (?:page |profile )?visits?\b/gi],
  [['instagramVisits','facebookVisits'],/\b(?:profile visits?|page visits?)\b/gi],
  [['roas','targetRoas'],/\broas\b/gi],
  [['ctr'],/\b(?:ctr|click.through rate)\b/gi],
  [['cpc'],/\b(?:cpc|cost per click)\b/gi],
  [['spend','cap','previousCap','monthlyBudget'],/\b(?:spend|spent|budget|cap)\b/gi],
  [['purchases'],/\b(?:purchases?|orders?)\b/gi],
  [['leads','formLeads','conversionLeads','websiteLeads','onMetaLeads'],/\bleads?\b/gi],
  [['conversations'],/\b(?:conversations?|chats?)\b/gi],
  [['landingViews'],/\blanding.page views?\b/gi],
  [['linkClicks'],/\blink clicks?\b/gi],
  [['clicks'],/\bclicks?\b/gi],
  [['thruplays'],/\bthruplays?\b/gi],
  [['reach'],/\b(?:reach|people reached)\b/gi],
  [['impressions'],/\bimpressions?\b/gi],
  [['frequency'],/\b(?:frequency|freq)\b/gi],
];

export function metricKey(fact:EvidenceFact){
  let key=fact.id.split(':').at(-1)!;
  if(key==='cost-per-result'){
    const label=fact.display.toLowerCase();
    key=/thruplay/.test(label)?'cost-per-thruplay':/lead/.test(label)?'cost-per-lead':/purchase/.test(label)?'cost-per-purchase':/visit/.test(label)?'cost-per-visit':key;
  }
  return key;
}

/** Validate the declared outcome around a binding before inserting its value.
 * A real number is not evidence for a different outcome or unit. */
export function validateMeasurementUnit(prose:string,offset:number,length:number,fact:EvidenceFact){
  const key=metricKey(fact);
  const before=prose.slice(Math.max(0,offset-65),offset).replace(/\{\{[^{}]+\}\}/g,'MEASURE');
  const after=prose.slice(offset+length,offset+length+60).replace(/\{\{[^{}]+\}\}/g,'MEASURE');
  if(/^\s*(?:qualified leads?|followers?|new followers?)\b/i.test(after))throw Error('Profile visits and reported leads do not establish followers or qualified outcomes.');
  const ranges:{keys:string[];start:number;end:number}[]=[];
  const text=before+' BINDING '+after,pos=before.length+1,end=pos+7;
  for(const [keys,re] of units)for(const m of text.matchAll(re)){
    const start=m.index!,stop=start+m[0].length;
    if(ranges.some(r=>start>=r.start&&stop<=r.end))continue;
    ranges.push({keys,start,end:stop});
  }
  // A directly following result noun is stronger than a preceding campaign or
  // objective name. Otherwise require an immediately declared metric label.
  const following=ranges.filter(r=>r.start>=end&&/^\s*(?:reported |attributed )?$/i.test(text.slice(end,r.start))).sort((a,b)=>a.start-b.start)[0];
  const preceding=ranges.filter(r=>r.end<=pos&&/^\s*(?:(?:was|were|is|are|of|at|reached|recorded|generated|reported|remained)\s*)?[:=]?\s*$/i.test(text.slice(r.end,pos))).sort((a,b)=>b.end-a.end)[0];
  const declared=following??preceding;
  if(!following&&preceding&&/\bat\s*$/i.test(text.slice(preceding.end,pos))){
    const costCounts:Record<string,string[]>={'cost-per-lead':['leads','formLeads','conversionLeads','websiteLeads','onMetaLeads'],'cost-per-purchase':['purchases'],'cost-per-visit':['instagramVisits','facebookVisits'],'cost-per-thruplay':['thruplays']};
    if(costCounts[key]?.some(count=>preceding.keys.includes(count)))return;
  }
  if(declared&&!declared.keys.includes(key)&&!(key==='targetCpa'&&declared.keys.includes('cost-per-purchase'))&&!(key==='targetCpl'&&declared.keys.includes('cost-per-lead')))
    throw Error('Metric unit mismatch: '+key+' cannot substantiate the declared outcome. Use the exact matching metric and entity.');
}

export function validateMeasurementEntity(prose:string,offset:number,fact:EvidenceFact,evidence:MeasurementEvidence){
  const subject=fact.id.match(/^window\d+:(?:previous-)?(?:campaign|adset|ad):([^:]+)(?::|$)/)?.[1]??(/:account:|:previous-account:/.test(fact.id)?evidence.account.id:undefined);
  if(!subject)return;
  const start=Math.max(0,prose.lastIndexOf(';',offset)+1,prose.lastIndexOf('. ',offset)+2);
  const before=prose.slice(start,offset).replace(/\{\{[^{}]+\}\}/g,m=>' '.repeat(m.length));
  const entities=[{id:evidence.account.id,name:evidence.account.name},...evidence.periods.flatMap(p=>p.campaigns),...evidence.facts.flatMap(f=>{
    const v=f.value as {id?:string;name?:string}|null;
    return /^window\d+:ad(?:set)?:[^:]+$/.test(f.id)&&v?.id&&v.name?[{id:v.id,name:v.name}]:[];
  })];
  const matches=entities.flatMap(entity=>[entity.id,entity.name].filter(s=>s.length>2).flatMap(text=>{
    const escaped=text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    return [...before.matchAll(new RegExp('(?<![A-Za-z0-9_])'+escaped+'(?![A-Za-z0-9_])','g'))].map(m=>({id:entity.id,end:m.index!+m[0].length}));
  })).sort((a,b)=>b.end-a.end);
  if(matches[0]&&before.length-matches[0].end<180&&matches[0].id!==subject)throw Error('Measurement entity mismatch. Bind the metric belonging to the named account, campaign or ad.');
}
