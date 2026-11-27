import {expect,it} from 'vitest';
import {dailyEvidence} from '../lib/reports/daily-analysis';
import {auditSourceObservations} from '../lib/reports/source-observations';
import {deduplicateFindings,optionalSetupFinding} from '../lib/reports/review-quality';
import {metrics,type Report} from '../lib/reports/model';
function report():Report {
 const current=metrics({spend:'100',impressions:'2000',actions:[{action_type:'lead',value:'20'}]}),prior=metrics({spend:'200',impressions:'2000',actions:[{action_type:'lead',value:'20'}]});
 const campaign={id:'101',name:'Synthetic lead campaign',objective:'OUTCOME_LEADS',settings:{goals:['LEAD_GENERATION'],bids:[],primary:{metric:'leads',label:'Leads',scale:'1' as string}},status:'ACTIVE',hasInsights:true,start:null,stop:null};
 return {account:{id:'act_123',name:'Synthetic',currency:'CAD',status:1},generated:'2026-11-27',periods:[{window:{since:'2026-11-20',until:'2026-11-26'},totals:current,campaigns:[{...campaign,...current}],notes:[],previous:{window:{since:'2026-11-13',until:'2026-11-19'},totals:prior,campaigns:[{...campaign,...prior}]}}]};
}
it('provides source-bound observations and same-outcome comparisons without business targets or AI',()=>{
 const r=report(),catalog=dailyEvidence(r),observations=auditSourceObservations(r,catalog.facts);expect(observations).toHaveLength(1);expect(observations[0].kind).toBe('lower_cost');expect(observations[0].evidence).toContain('100.00');expect(observations[0].evidence).toContain('5.00');expect(observations[0].evidence).toContain('10.00');expect(observations[0].title).toContain('leads');expect(observations[0].title).not.toContain('purchases');expect(observations[0].evidenceIds.every(id=>catalog.facts.some(f=>f.id===id))).toBe(true);
});
it('keeps missing outcomes missing and declines cost-trend conclusions from small samples',()=>{
 const r=report();r.periods[0].previous!.campaigns[0].leads=9;let result=auditSourceObservations(r,dailyEvidence(r).facts);expect(result[0].kind).toBe('observation');r.periods[0].campaigns[0].leads=null;result=auditSourceObservations(r,dailyEvidence(r).facts);expect(result[0].evidence).toContain('not available');expect(result[0].evidence).not.toContain('zero');expect(result[0].evidenceIds).not.toContain('window0:campaign:101:cost-per-result');
});
it('removes only optional setup-only action items and retains real metric/source gaps',()=>{
 const setup={tone:'warn' as const,category:'data_gap' as const,title:'No approved budget or CPA target supplied',detail:'Optional inputs',action:'Confirm the budget',reason:'Target comparisons skipped',evidenceIds:['window0:coverage','window0:client-context','window0:account:spend']};
 expect(optionalSetupFinding(setup)).toBe(true);expect(deduplicateFindings([setup])).toEqual([]);
 const source={...setup,title:'Purchase metric and target are unavailable',evidenceIds:['window0:campaign:101:purchases']};expect(optionalSetupFinding(source)).toBe(false);expect(deduplicateFindings([source])).toEqual([source]);
});
