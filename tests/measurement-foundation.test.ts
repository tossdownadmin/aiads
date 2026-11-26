import {expect,it} from 'vitest';
import {dailyFact,defaultLayout} from '../lib/reports/daily-metrics';
import {metrics,joinCampaigns,type Report} from '../lib/reports/model';
import {dailyEvidence,validateDailyAnalysis} from '../lib/reports/daily-analysis';
import {validateProposal} from '../lib/reports/plan';
import {clientReadiness,reviewQuality,deduplicateFindings,deliveryNotices} from '../lib/reports/review-quality';
import {readStoredTemplate,type ClientLayout} from '../lib/reports/daily-template';
const account={id:'act_123',name:'Synthetic account',currency:'CAD',status:1};
const window={since:'2026-11-16',until:'2026-11-22'};
const totals=metrics({spend:100,impressions:1000,actions:[{action_type:'onsite_conversion.facebook_profile_visit',value:100},{action_type:'onsite_conversion.instagram_profile_visit',value:10},{action_type:'lead',value:7}]});
const campaign=(id:string,name='Facebook Profile Visits')=>({...totals,id,name,status:'ACTIVE',objective:'LINK_CLICKS',start:null,stop:null,hasInsights:true,settings:{goals:['PROFILE_VISIT'],bids:[]}});
const snapshot=()=>({window,totals,campaigns:[campaign('campaign-a')],notes:[]});
const report=():Report=>({account,generated:'2026-11-23',periods:[snapshot()]});
const check=(text:string,id='window0:account:leads',r=report())=>validateDailyAnalysis({periods:[{periodId:'window0',findings:[{tone:'ok',category:'observation',title:'Measured outcome',interpretation:text,evidenceIds:[id],action:'Review the evidence.',reason:'Use the measured outcome.'}]}]},dailyEvidence(r));
it('uses Facebook visits and the same denominator in generic visit cards',()=>{
 const p=snapshot();expect(defaultLayout(p).columns).toBe('VISITS');
 expect(dailyFact('Profile Visits',account,p,undefined,'VISITS',[]).value).toBe('100');
 expect(dailyFact('Cost/Visit',account,p,undefined,'VISITS',[]).value).toBe('$1.00');
 expect(dailyFact('Profile Visits',account,p,undefined,'VISITS',[]).source).toMatchObject({metric:'facebookVisits',entityIds:['campaign-a'],window});
});
it('keeps explicit campaign bindings stable through renames and distinct per-window settings',()=>{
 const p=snapshot();p.campaigns[0].name='Renamed campaign';
 const layout:ClientLayout={name:'Example',periods:[0,1].map(i=>({cards:['Result'],kpis:[],columns:'VISITS',bindings:{Result:{metric:i?'instagramVisits':'facebookVisits',campaignIds:['campaign-a']}}}))};
 expect(dailyFact('Result',account,p,layout,'VISITS',[],'',0).value).toBe('100');
 expect(dailyFact('Result',account,p,layout,'VISITS',[],'',1).value).toBe('10');
 p.campaigns[0].id='other';expect(dailyFact('Result',account,p,layout,'VISITS',[]).value).toBe('—');
 expect(readStoredTemplate(JSON.stringify({clients:[layout]}))).toBeDefined();
 expect(readStoredTemplate(JSON.stringify({clients:[{...layout,periods:layout.periods!.map(p=>({...p,bindings:{Result:{metric:'invented'}}}))}]}))).toBeUndefined();
});
it('does not guess among ambiguous campaign-name matches or sum unique reach across campaigns',()=>{
 const p=snapshot();p.campaigns.push(campaign('campaign-b'));
 expect(dailyFact('Profile Visits',account,p,undefined,'VISITS',[]).value).toBe('—');
 const layout:ClientLayout={name:'Example',periods:[{columns:'VISITS',cards:['Reach'],kpis:[],bindings:{Reach:{metric:'reach',campaignIds:['campaign-a','campaign-b']}}}]};
 expect(dailyFact('Reach',account,p,layout,'VISITS',[]).value).toBe('—');
});
it.each(['The campaign generated {{window0:account:leads}} purchases.','Purchases were {{window0:account:leads}}.','ROAS was {{window0:account:leads}}.','Spend was {{window0:account:leads}}.'])(
 'rejects a valid number bound to a different outcome: %s',text=>expect(()=>check(text)).toThrow('unit mismatch'));
it('binds correct outcomes and rejects known but wrong campaign identities',()=>{
 expect(check('Leads were {{window0:account:leads}}.')[0].findings[0].interpretation).toBe('Leads were 7.');
 const r=report();r.periods[0].campaigns.push(campaign('campaign-b','Second campaign'));
 expect(()=>check('Campaign campaign-a generated {{window0:campaign:campaign-b:leads}} leads.','window0:campaign:campaign-b:leads',r)).toThrow('entity mismatch');
});
it('does not accept invented monthly metrics or unsupported business breakeven',()=>{
 const base={summary:'Measured plan',financialReview:'No cap',performance:[],competitors:[],event:'None',allocation:[],concepts:[],takeaways:[],gaps:[]};
 expect(()=>validateProposal({...base,performance:['The campaign generated 999 purchases.']},[])).toThrow('numeric');
 expect(()=>validateProposal({...base,summary:'ROAS is above breakeven.'},[])).toThrow('breakeven');
 expect(()=>validateProposal({...base,summary:'This exceeds the break-even threshold.'},[])).toThrow('breakeven');
 const evidence=dailyEvidence(report());
 expect(()=>validateProposal({...base,summary:'Reported {{window0:account:leads}} purchases.'},[],undefined,evidence)).toThrow('unit mismatch');
 expect(validateProposal({...base,summary:'Reported {{window0:account:leads}} leads.'},[],undefined,evidence).summary).toBe('Reported 7 leads.');
});
it('shows incomplete readiness and sparse review coverage instead of a full performance assessment',()=>{
 expect(clientReadiness(null,account,window.until).status).toBe('incomplete');
 const p={...snapshot(),analysis:{findings:[{tone:'warn' as const,category:'data_gap' as const,title:'No approved budget',detail:'No target supplied',action:'Confirm the brief',reason:'Readiness gap',evidenceIds:['window0:coverage']}]}};
 expect(reviewQuality(account,p).status).toBe('limited');expect(reviewQuality(account,p).performanceFindings).toBe(0);
 expect(reviewQuality(account,{...p,totals:null,campaigns:[]}).status).toBe('unavailable');
 const context={accountId:account.id,currency:'CAD',businessGoal:'Acquire orders',primaryOutcome:'purchases' as const,conversionDefinition:'Fulfilled orders',markets:'Approved service area',monthlyBudget:1000,budgetMonth:'2026-11',targetCpa:20,targetOwner:'Account manager',approvedOn:'2026-11-01',validUntil:'2026-11-30',qualificationNotes:'',updatedAt:'2026-11-01T00:00:00Z'};
 expect(clientReadiness(context,account,window.until).status).toBe('ready');
 expect(clientReadiness({...context,currency:'USD'},account,window.until).status).toBe('incomplete');
 expect(clientReadiness({...context,validUntil:'2026-11-01'},account,window.until).gaps).toContain('Current target validity');
});
it('merges repeated issues but preserves different evidence and severity',()=>{
 const base={tone:'warn' as const,category:'data_gap' as const,title:'Imported outcome metric unavailable',detail:'Source measurement is missing',action:'Check the import',reason:'Verify source coverage',evidenceIds:['window0:coverage','window0:account:leads']};
 expect(deduplicateFindings([base,{...base,title:'Imported outcome metric unavailable for source review'}])).toHaveLength(1);
 expect(deduplicateFindings([base,{...base,tone:'crit'}])).toHaveLength(2);
 expect(deduplicateFindings([base,{...base,evidenceIds:['window0:campaign:other:spend'],title:'Other campaign spend'}])).toHaveLength(2);
});

it('rejects target attainment without current approval while allowing a measured prior-period comparison',()=>{
 expect(()=>check('CPL is below the approved target.')).toThrow('target-attainment');
 expect(()=>check('The campaign is delivering visits efficiently.')).toThrow('efficiency grade');
 expect(()=>check('The reported CPL is lower than the previous period.')).not.toThrow();
 expect(()=>check('The target is unknown; reported {{window0:account:leads}} leads.')).not.toThrow();
});

it('does not reduce measurement coverage merely because commercial inputs were not supplied',()=>{
 const p={...snapshot(),previous:{window:{since:'2026-11-09',until:'2026-11-15'},totals,campaigns:[campaign('campaign-a')]},analysis:{findings:[{tone:'ok' as const,category:'win' as const,title:'Measured delivery',detail:'Reported source outcome',action:'Review the measured observation',reason:'Actual source',evidenceIds:['window0:campaign:campaign-a:facebookVisits']}]}};
 const quality=reviewQuality(account,p,null);expect(quality.checks.find(c=>c.key==='context')!.status).toBe('not_applicable');expect(quality.readiness.status).toBe('incomplete');expect(quality.status).toBe('reviewed');
});
