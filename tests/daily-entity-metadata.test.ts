import {expect,it} from 'vitest';
import {dailyEvidence,validateDailyAnalysis} from '../lib/reports/daily-analysis';
import {dailyWindows,metrics,type Report} from '../lib/reports/model';

const report:Report={account:{id:'act_test',name:'Synthetic account',currency:'CAD',status:1},generated:'2026-11-23',periods:dailyWindows('2026-11-22','2026-11-23').slice(0,1).map(window=>({window,notes:[],totals:metrics({spend:'100',impressions:'1000'}),campaigns:[]}))};
const ad='window0:ad:888111222',adset='window0:adset:888111333',delivery='window0:campaign:event:delivery';
const evidence=()=>{
 const value=dailyEvidence(report);
 value.facts.push(
  {id:ad,periodId:'window0',display:'Synthetic ad — ad performance: returned',value:{id:'888111222',adsetId:'888111333',campaignId:'event',name:'Synthetic ad',stats:{spend:12.34,leads:4,ctr:2.5,roas:1.2,frequency:1.2345,purchases:null},settings:{budget:39},copy:['Nov 2–5']}},
  {id:adset,periodId:'window0',display:'Synthetic set — settings and outcomes: returned',value:{id:'888111333',name:'Synthetic set',stats:{spend:42},settings:{'Daily budget':'CAD 39'}}},
  {id:delivery,periodId:'window0',display:'Synthetic campaign — delivery: returned',value:{start:'2026-11-11',stop:'2026-11-15',status:'PAUSED'}}
 );return value;
};
const check=(interpretation:string,ids=[ad],source=evidence())=>validateDailyAnalysis({periods:[{periodId:'window0',findings:[{tone:'ok',category:'observation',title:'Measured review',interpretation,evidenceIds:ids,action:'Review the supplied evidence.',reason:'Compare the same dates.'}]}]},source)[0].findings[0];

it('binds explicit existing nested ad and ad-set metrics with their canonical units',()=>{
 expect(check('Ad 888111222 spent {{'+ad+':spend}} in ad set 888111333.').interpretation).toBe('Ad 888111222 spent CAD $12.34 in ad set 888111333.');
 expect(check('Spend was {{'+adset+':spend}}.',[adset]).interpretation).toBe('Spend was CAD $42.00.');
 expect(check('CTR was {{'+ad+':ctr}}%; ROAS was {{'+ad+':roas}}; frequency was {{'+ad+':frequency}}.').interpretation).toBe('CTR was 2.50%; ROAS was 1.20×; frequency was 1.23.');
 expect(check('Purchases were {{'+ad+':purchases}}.').interpretation).toBe('Purchases were Not reported.');
});

it.each([ad,ad+':budget',ad+':settings:budget',ad+':stats:spend',ad+':missing',ad+':cost-per-lead','window1:ad:888111222:spend'])(
 'rejects whole objects, invented/derived fields, arbitrary paths and other windows: %s',id=>expect(()=>check('Spend was {{'+id+'}}.')).toThrow('numeric metric'));

it('requires the exact parent citation and a finite numeric or explicit null stats value',()=>{
 expect(()=>check('Spend was {{'+ad+':spend}}.',['window0:account:spend'])).toThrow('numeric metric');
 for(const stats of [{},{spend:undefined},{spend:'12.34'},{spend:NaN},{spend:Infinity}]){
  const source=evidence();source.facts.find(f=>f.id===ad)!.value={stats};
  expect(()=>check('Spend was {{'+ad+':spend}}.',[ad],source)).toThrow('numeric metric');
 }
 expect(()=>check('Spend was {{'+ad+':spend}}%.')).toThrow('percentage suffix');
});

it('recognizes cited entity IDs without accepting unknown IDs, uncited IDs or measurements',()=>{
 expect(check('Review ad 888111222 in ad set 888111333.').interpretation).toContain('888111333');
 expect(()=>check('Review ad 888111224.')).toThrow('Unbound numeric');
 expect(()=>check('Review ad 888111222.',['window0:account:spend'])).toThrow('Unbound numeric');
 expect(()=>check('Spend was CAD 39.')).toThrow('Unbound numeric');
 expect(()=>check('CPL increased by over 100%.')).toThrow('Unbound numeric');
});

it('recognizes only exact dates from a cited campaign delivery schedule',()=>{
 expect(check('The planned flight was Nov 11–15, 2026.',[delivery]).interpretation).toContain('Nov 11–15');
 for(const label of ['Nov 10–15','Nov 11–16','Nov 11–15, 2027','Nov 2–5'])expect(()=>check('The planned flight was '+label+'.',[delivery])).toThrow('Unbound numeric');
 expect(()=>check('The planned flight was Nov 11–15.')).toThrow('Unbound numeric');
 const source=evidence();source.facts.find(f=>f.id===delivery)!.value={start:'2026-02-30',stop:'2026-03-02'};
 expect(()=>check('The planned flight was Feb 30–Mar 2.',[delivery],source)).toThrow('Unbound numeric');
});
