import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { renderDailyDocument } from '../lib/reports/daily-document';
import { BRAND_ICON_DATA_URI } from '../lib/ui/brand-icon';
import { dailyWindows, joinCampaigns, metrics, type Report, type Snapshot } from '../lib/reports/model';
import type { ReportFinding } from '../lib/skills/report-types';

const end='2026-11-18';
const windows=dailyWindows(end,'2026-11-19');
const account={id:'act_123',name:'Alpha',currency:'CAD',status:1};
const finding=(patch:Partial<ReportFinding>={}):ReportFinding=>({tone:'warn',title:'Review delivery',detail:'Legacy combined text',action:'Review the campaign',reason:'Check the supplied evidence before changing delivery.',...patch});
function entry(findings:ReportFinding[],options:{account?:typeof account;period?:Partial<Snapshot>}={}) {
  const selected=options.account??account;
  const report:Report={account:selected,generated:'2026-11-19T00:00:00Z',periods:windows.map(window=>({
    window,totals:metrics({spend:120,ctr:1.2,cpc:2,impressions:1000,actions:[{action_type:'lead',value:6}]}),
    campaigns:joinCampaigns([],[{campaign_id:'campaign-1',campaign_name:'Lead campaign',objective:'OUTCOME_LEADS',spend:120,actions:[{action_type:'lead',value:6}]}],window),
    notes:[],analysis:{findings},...options.period,
  }))};
  return {account:selected,report};
}
function panel(html:string,key='0') {
  const start=html.indexOf('<section class="tab-panel" data-panel="'+key+'"');
  expect(start).toBeGreaterThan(-1);
  const next=html.indexOf('<section class="tab-panel"',start+1);
  return html.slice(start,next===-1?html.indexOf('</main>',start):next);
}
function section(html:string,className:string) {
  const result=html.match(new RegExp('<section class="'+className+'"[^>]*>([\\s\\S]*?)</section>'));
  expect(result).not.toBeNull();
  return result![1];
}
const actionTitles=(html:string)=>Array.from(section(html,'actions-section').matchAll(/<h4 class="rec-title">([^<]*)<\/h4>/g),m=>m[1]);

describe('daily report client presentation',()=>{
  it('separates wins, concerns and availability, with readable interpretation and visible support',()=>{
    const doc=renderDailyDocument([entry([
      finding({tone:'ok',title:'Recorded leads',action:'Review lead quality',interpretation:'Six leads were reported.',evidence:['Leads: 6','Spend: CAD 120','CPL: CAD 20']}),
      finding({title:'Check response',interpretation:'Review the response against the brief.'}),
    ],{period:{notes:['Campaign-level coverage is limited.'],reviewNotes:['No client targets supplied.','CRM outcomes are unavailable.']}})],end);
    const accountPanel=panel(doc);
    const wins=accountPanel.match(/aria-label="Wins">([\s\S]*?)<\/section>/)![1];
    const concerns=accountPanel.match(/aria-label="Concerns">([\s\S]*?)<\/section>/)![1];
    expect(wins).toContain('Recorded leads'); expect(wins).not.toContain('Check response');
    expect(wins).toContain('Six leads were reported.');expect(wins).not.toContain('Legacy combined text');
    const [visible,disclosure]=wins.split('<details class="evidence-more">');
    expect(visible).toContain('Leads: 6');expect(visible).toContain('Spend: CAD 120');expect(visible).not.toContain('CPL: CAD 20');
    expect(disclosure).toContain('CPL: CAD 20');expect(disclosure).not.toContain('<details');
    expect(concerns).toContain('Check response');expect(concerns).not.toContain('CRM outcomes');
    const notes=section(accountPanel,'availability-section');
    for (const note of ['Campaign-level coverage is limited.','No client targets supplied.','CRM outcomes are unavailable.','this skill does not visually analyse them']) expect(notes).toContain(note);
    expect(panel(doc,'overview')).toContain('class="kpi-label">Warnings</div><div class="kpi-value">1</div>');
    const campaignPosition=accountPanel.indexOf('Campaign Performance');
    for (const label of ['Wins','Concerns','Prioritized actions','Data availability']) expect(accountPanel.indexOf(label)).toBeLessThan(campaignPosition);
    expect(accountPanel.slice(campaignPosition)).not.toContain('class="actions-section"');
  });

  it('orders the portfolio work queue by priority, severity and stable account identity',()=>{
    const alpha=entry([
      finding({tone:'warn',priority:'now',action:'Alpha now'}),
      finding({tone:'warn',priority:'next',action:'Alpha next'}),
      finding({tone:'crit',priority:'monitor',action:'Alpha monitor'}),
    ]);
    const zulu=entry([
      finding({tone:'warn',priority:'now',action:'Zulu now'}),
      finding({tone:'crit',priority:'now',action:'Zulu critical',reason:'Highest severity reason'}),
      finding({tone:'ok',priority:'monitor',action:'Zulu critical',reason:'Duplicate lower-priority action'}),
    ],{account:{...account,id:'act_456',name:'Zulu',currency:'USD'}});
    const doc=renderDailyDocument([zulu,alpha],end);
    const queue=section(panel(doc,'overview'),'actions-section');
    expect(actionTitles(panel(doc,'overview'))).toEqual(['Zulu critical','Alpha now','Zulu now','Alpha next','Alpha monitor']);
    expect(queue).toContain('not a comparative performance ranking');
    expect(queue).toContain('data-open="0">Zulu');expect(queue).toContain('data-open="1">Alpha');
    expect(queue).not.toContain('Duplicate lower-priority action');
    const reversed=[alpha,zulu].map(e=>({...e,report:{...e.report,periods:e.report.periods.map(p=>({...p,analysis:{findings:[...p.analysis!.findings].reverse()}}))}}));
    expect(actionTitles(panel(renderDailyDocument(reversed,end),'overview'))).toEqual(actionTitles(panel(doc,'overview')));
    const overview=panel(doc,'overview');
    expect(overview).toContain('CAD accounts · $120.00 total');expect(overview).toContain('USD accounts · $120.00 total');
    expect(overview).not.toContain('$240.00');
  });

  it('retains legacy detail and derives useful priority labels without new fields',()=>{
    const doc=renderDailyDocument([entry([
      finding({tone:'ok',action:'Keep observing',detail:'Legacy positive detail'}),
      finding({tone:'warn',action:'Review next',detail:'Legacy concern detail'}),
      finding({tone:'crit',action:'Review first',detail:'Legacy critical detail'}),
    ])],end);
    const accountPanel=panel(doc);
    expect(accountPanel).toContain('Legacy positive detail');expect(accountPanel).toContain('Legacy concern detail');expect(accountPanel).toContain('Legacy critical detail');
    expect(actionTitles(accountPanel)).toEqual(['Review first','Review next','Keep observing']);
    for (const label of ['Now — Review first','Next — Plan the next step','Monitor — Keep under review']) expect(accountPanel).toContain(label);
    expect(accountPanel).not.toContain('class="evidence-more"');expect(accountPanel).not.toContain('class="comparison-section"');expect(accountPanel).not.toContain('class="pacing-section"');
    const fallback=entry([]);fallback.report.periods.forEach(p=>delete p.analysis);
    expect(panel(renderDailyDocument([fallback],end))).toContain('Prioritized actions');
  });

  it('escapes all new narrative, action, evidence and review-note text',()=>{
    const attack='<img src=x onerror="alert(1)"> & \'quoted\'';
    const escaped='&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;quoted&#39;';
    const doc=renderDailyDocument([entry([finding({title:attack,detail:attack,interpretation:attack,action:attack,reason:attack,evidence:[attack,'Second label','</details><script>bad()</script>']})],{account:{...account,name:attack},period:{notes:[attack],reviewNotes:[attack]}})],end);
    expect(doc).not.toContain(attack);expect(doc).not.toContain('<script>bad()');expect(doc).toContain(escaped);
    expect(section(panel(doc),'availability-section')).toContain(escaped);
    expect(section(panel(doc),'actions-section')).toContain(escaped);
    expect(doc).toContain('&lt;/details&gt;&lt;script&gt;bad()&lt;/script&gt;');
    expect(doc).toContain('rel="icon" type="image/png" href="'+BRAND_ICON_DATA_URI+'"');
    expect(doc).toContain('<img src="'+BRAND_ICON_DATA_URI+'" width="32" height="32" alt="Tossdown">');
    expect(doc).not.toMatch(/<script[^>]+src=/);expect(doc).not.toMatch(/<link[^>]+rel="stylesheet"/);
  });

  it('compares only actual separate equal-length windows with neutral metric changes',()=>{
    const previous={window:{since:'2026-11-05',until:'2026-11-11'},campaigns:[],totals:metrics({spend:100,ctr:1.5,cpc:2,actions:[{action_type:'lead',value:8}]})};
    const doc=renderDailyDocument([entry([finding()],{period:{previous}})],end);
    const comparison=section(panel(doc),'comparison-section');
    expect(comparison).toContain('Two separate 7-day windows');expect(comparison).toContain('Nov 5, 2026 – Nov 11, 2026');
    expect(comparison).toContain('+$20.00');expect(comparison).toContain('−2');expect(comparison).toContain('−0.30 pp');expect(comparison).toContain('No change');
    expect(comparison).toContain('<th scope="row">Purchases</th><td>—</td><td>—</td><td>—</td>');
    expect(comparison).not.toMatch(/metric-good|metric-warn|metric-crit|improved|declined|on track/);
    const overlap=renderDailyDocument([entry([finding()],{period:{previous:{...previous,window:windows[0]}}})],end);
    expect(section(panel(overlap),'comparison-section')).toContain('windows overlap or differ in length');
    expect(section(panel(overlap),'comparison-section')).not.toContain('+$20.00');
    const unequal=renderDailyDocument([entry([finding()],{period:{previous:{...previous,window:{since:'2026-11-01',until:'2026-11-11'}}}})],end);
    expect(section(panel(unequal),'comparison-section')).not.toContain('+$20.00');
  });

  it('uses the supplied pacing values and keeps the gallery last',()=>{
    const doc=renderDailyDocument([entry([finding()],{period:{pacing:{month:'2026-11',budget:3000,spent:1010,elapsedDays:18,monthDays:30,expectedSpend:1799,projectedSpend:1688}}})],end);
    const accountPanel=panel(doc),pacing=section(accountPanel,'pacing-section');
    for (const value of ['$3,000.00','$1,010.00','$1,799.00','$1,688.00','18 of 30 days']) expect(pacing).toContain(value);
    expect(pacing).toContain('projection is an estimate');expect(pacing).not.toMatch(/under budget|over budget|on track|metric-good|metric-crit/);
    expect(accountPanel.indexOf('class="pacing-section"')).toBeLessThan(accountPanel.indexOf('data-campaign-gallery'));
  });

  it('opens all supporting evidence for print and restores the reader’s disclosure choices',()=>{
    const doc=renderDailyDocument([entry([finding({evidence:['One','Two','Three']})])],end);
    const script=Array.from(doc.matchAll(/<script>([\s\S]*?)<\/script>/g)).at(-1)![1];
    const closed={open:false},opened={open:true};
    const handlers:Record<string,()=>void>={};
    runInNewContext(script,{
      document:{querySelectorAll:(selector:string)=>selector==='details.evidence-more'?[closed,opened]:[],addEventListener:()=>{}},
      window:{addEventListener:(event:string,callback:()=>void)=>{handlers[event]=callback;}},location:{hash:''},
    });
    handlers.beforeprint();expect(closed.open).toBe(true);expect(opened.open).toBe(true);
    handlers.beforeprint();handlers.afterprint();expect(closed.open).toBe(false);expect(opened.open).toBe(true);
  });
});

it('shows source disapprovals and limited coverage even when the AI only reports missing context',()=>{
 const row=entry([finding({category:'data_gap',title:'Missing client brief',evidenceIds:['window0:coverage']})]);
 for(const p of row.report.periods)p.details={'campaign-1':{notes:[],sets:[{id:'set-1',name:'Local audience',status:'ACTIVE',settings:{},ads:[{id:'ad-1',name:'Disapproved ad',status:'DISAPPROVED',creative:{id:'creative-1',copy:[],titles:[],descriptions:[],links:[],ctas:[],assets:[],post:'',notes:[]}}]}]}};
 const doc=renderDailyDocument([row],end);
 expect(doc).toContain('Current ad disapprovals');expect(doc).toContain('ad-1');expect(doc).toContain('limited');
 expect(doc).toContain('Primary outcome');expect(doc).toContain('Performance findings');
});
