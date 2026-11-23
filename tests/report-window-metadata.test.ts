import {expect,it} from 'vitest';
import {dailyEvidence,validateDailyAnalysis,recoverDailyFindings} from '../lib/reports/daily-analysis';
import {dailyWindows,previousWindow,metrics,type Report} from '../lib/reports/model';
import {maskReportingDates} from '../lib/reports/daily-dates';

const report:Report={account:{id:'act_123',name:'Test account',currency:'USD',status:1},generated:'2026-11-23',periods:dailyWindows('2026-11-22','2026-11-23').map(window=>({window,totals:null,campaigns:[],notes:['Meta returned no account-level insight row for this period.'],previous:{window:previousWindow(window),totals:metrics({spend:'62.47',impressions:'5021',actions:[{action_type:'link_click',value:'110'}],video_thruplay_watched_actions:[{action_type:'video_view',value:'2310'}]}),campaigns:[]}}))};
const observation=(id:string,title:string,interpretation:string,evidenceIds=[id+':coverage'])=>({periodId:id,findings:[{tone:'warn',category:'data_gap',title,interpretation,evidenceIds,action:'Compare the same reporting dates in Ads Manager.',reason:'Missing imported data does not establish zero delivery.'}]});
const check=(title:string,interpretation:string,evidenceIds=['window0:coverage'])=>validateDailyAnalysis({periods:[observation('window0',title,interpretation,evidenceIds)]},{...dailyEvidence(report),periods:dailyEvidence(report).periods.slice(0,1)});

it.each(['Nov 16–22','Nov 16 - 22','November 16 through November 22','Nov. 16–22, 2026','Nov 16, 2026 to Nov 22, 2026','2026-11-16 to 2026-11-22','Nov 9–15','November 9–15, 2026'])(
 'recognizes the exact current or previous source range %s as metadata',label=>{
  expect(check('No account-level metrics returned for '+label,'Compare the reporting evidence for '+label+'.')[0].findings[0].title).toContain(label);
 });

it.each(['Nov 16–23','Nov 15–22','Nov 16–22, 2027','Nov 9–15, 2025','Nov 9–150','Oct 16–22','999 purchases','CTR above 6%'])(
 'continues to reject invented dates and measurements: %s',claim=>expect(()=>check(claim,'Inspect the available evidence.')).toThrow('Unbound numeric'));

it('handles ranges that cross a month, year or leap day and rejects changed endpoints',()=>{
 for(const [window,label] of [
  [{since:'2026-10-24',until:'2026-11-22'},'Oct 24–Nov 22, 2026'],
  [{since:'2026-12-28',until:'2027-01-03'},'Dec 28, 2026–Jan 3, 2027'],
  [{since:'2024-02-23',until:'2024-02-29'},'February 23–29, 2024'],
 ] as const){expect(maskReportingDates(label,[window])).toBe('REPORTING_DATE_RANGE');expect(maskReportingDates(label.replace(/202[467]/g,'2099'),[window])).toMatch(/\d/);}
});

it('binds explicitly missing metrics to Not reported while keeping missing data distinct from zero',()=>{
 const id='window0:account:spend';
 const result=check('Imported spend unavailable','Spend is {{'+id+'}}.',[id]);
 expect(result[0].findings[0].interpretation).toBe('Spend is Not reported.');
 expect(()=>check('Zero delivery','No ads were delivering.',[id])).toThrow('zero delivery');
 expect(()=>check('Missing evidence','Spend is {{window0:client-context}}.',['window0:client-context'])).toThrow('numeric metric');
 expect(()=>check('Missing evidence','Spend is {{window0:account:unknown}}.',['window0:coverage'])).toThrow('numeric metric');
});

it('renders a CTR placeholder with a single percent sign and rejects percentages bound to spend',()=>{
 const evidence=dailyEvidence(report),fact=evidence.facts.find(f=>f.id==='window0:account:ctr')!;fact.value=4;fact.display='Account — CTR: 4.00%';
 const response={periods:[observation('window0','Reported CTR','CTR is {{window0:account:ctr}}%.',['window0:account:ctr'])]};
 const result=validateDailyAnalysis(response,{...evidence,periods:evidence.periods.slice(0,1)});
 expect(result[0].findings[0].interpretation).toBe('CTR is 4.00%.');
 expect(()=>check('Spend percent','Spend is {{window0:account:spend}}%.',['window0:account:spend'])).toThrow('percentage suffix');
});

it('recovers a missing-data observation and a previous-period baseline for a window with no current insight row',()=>{
 const raw={periods:[
  observation('window0','No account-level metrics returned for Nov 16–22','Spend is {{window0:account:spend}}; historical delivery cannot be established.',['window0:coverage','window0:account:spend']),
  observation('window1','Previous period review','The comparison period is Sep 24–Oct 23, 2026.'),
 ]};
 raw.periods[0].findings.push({...observation('window0','Previous period delivered','Nov 9–15 recorded {{window0:previous-account:linkClicks}} link clicks.',['window0:previous-account:linkClicks']).findings[0],category:'observation'});
 const result=recoverDailyFindings([raw],dailyEvidence(report));
 expect(result.periods[0].findings).toHaveLength(2);expect(result.periods[0].findings[1].interpretation).toContain('110 link clicks');
});
