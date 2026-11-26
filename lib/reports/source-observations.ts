import type {Report} from './model';
import type {EvidenceFact} from './measured-text';
import {resultKind,resultLabel} from './daily-metrics';
export type SourceObservation={title:string;evidence:string;recommendation:string;evidenceIds:string[];kind:'observation'|'lower_cost'|'higher_cost'};
/** Compiled observations of supplied facts. These are never presented as AI analysis. */
export function auditSourceObservations(report:Report,facts:EvidenceFact[]):SourceObservation[] {
  const period=report.periods[0];if(!period)return [];
  const catalog=new Map(facts.map(f=>[f.id,f]));
  const scalar=(id:string)=>{const f=catalog.get(id);return f&&typeof f.value==='number'&&Number.isFinite(f.value)&&f.value>=0?f:undefined;};
  return period.campaigns.filter(c=>c.hasInsights&&(c.spend??0)>0).sort((a,b)=>b.spend!-a.spend!).slice(0,8).map(c=>{
    const prefix='window0:campaign:'+c.id,goal=resultKind(c),spend=scalar(prefix+':spend'),result=goal?scalar(prefix+':'+goal):undefined,cost=goal?scalar(prefix+':cost-per-result'):undefined;
    const refs=[spend,result,cost].filter((f):f is EvidenceFact=>!!f);let kind:SourceObservation['kind']='observation';
    const previousGoal=goal&&scalar('window0:previous-campaign:'+c.id+':'+goal),previousCost=goal&&scalar('window0:previous-campaign:'+c.id+':cost-per-result');
    // A reported-cost comparison does not need a business target. Small samples
    // and unmatched/missing denominators do not establish a performance change.
    if(result&&previousGoal&&cost&&previousCost&&Number(result.value)>=10&&Number(previousGoal.value)>=10&&Number(previousCost.value)>0){
      refs.push(previousCost,previousGoal);if(Number(cost.value)<Number(previousCost.value))kind='lower_cost';else if(Number(cost.value)>=Number(previousCost.value)*1.25)kind='higher_cost';
    }
    return {title:(kind==='lower_cost'?'Lower reported cost per '+resultLabel(goal!):kind==='higher_cost'?'Review higher reported cost per '+resultLabel(goal!):'Reported campaign outcomes')+' · '+c.name,kind,evidence:refs.map(f=>f.display).join('. ')+(!result?' The configured outcome is not available as a verified named measurement in this report.':''),evidenceIds:refs.map(f=>f.id),recommendation:kind==='higher_cost'?'Inspect the campaign’s goal, attribution, creative and result quality across the compared periods before choosing a change.':kind==='lower_cost'?'Review the lower reported cost alongside result quality and attribution before extending the approach. It does not establish profit or incremental sales.':'Use these dated source measurements to review the campaign. Missing imported outcomes are not verified zero results.'};
  }).filter(f=>f.evidenceIds.length>0);
}
