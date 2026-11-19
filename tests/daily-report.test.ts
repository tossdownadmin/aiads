import { describe, expect, it } from 'vitest';
import { importDailyTemplate, matchPortfolio, readStoredTemplate } from '../lib/reports/daily-template';
import { renderDailyDocument } from '../lib/reports/daily-document';
import { dailyFact, dailyFindings, resultKind } from '../lib/reports/daily-metrics';
import { dailyWindows, joinCampaigns, metrics } from '../lib/reports/model';

const period = "flag:'warn',\n card:[['Spend','$900 old'],['Leads','old']],\n kpis:[['Total Spend','$900 old','CAD'],['CPL','old','Both campaigns']],\n cols:C_LEADS,rows:[],issues:[],recs:[]}";
const reference = "<script>/*__DATA_START__*/\nconst ACCOUNTS = [\n{id:'food',name:'Food',acct:'123',cur:'CAD',loc:'Canada',short:'Canada',type:'Lead Gen',\n p7:{"+period+",\n p30:{"+period+"}\n];\nconst ORDER = ['food'];\nconst SUMS = {};\nconst NOT_INCLUDED = [\n ['Other — Account not found','Check access']\n];\n/*__DATA_END__*/</script>";
const account = { id:'act_123',name:'Food',currency:'CAD',status:1 };
const end='2026-11-10', windows=dailyWindows(end,'2026-11-19');
const campaigns=joinCampaigns([], [
  { campaign_id:'1',campaign_name:'East',objective:'OUTCOME_LEADS',spend:'40',actions:[{action_type:'lead',value:'4'}] },
  { campaign_id:'2',campaign_name:'West',objective:'OUTCOME_LEADS',spend:'60',actions:[{action_type:'lead',value:'3'}] },
  { campaign_id:'3',campaign_name:'Message <b>us</b>',objective:'OUTCOME_ENGAGEMENT',spend:'14',actions:[{action_type:'onsite_conversion.messaging_conversation_started_7d',value:7},{action_type:'onsite_conversion.total_messaging_connection',value:11}] },
],windows[0]);
const periods=windows.map(window=>({window,campaigns,totals:metrics({spend:'114',actions:[{action_type:'lead',value:'7'}]}),notes:[],inventory:{total:3,active:2}}));
describe('daily template and live reports',()=>{
  it('imports only expected identities and metric definitions, then matches account IDs before names',()=>{
    const template=importDailyTemplate(reference);
    expect(template.clients[0].periods![0].kpis).toEqual(['Total Spend','CPL']);
    const stored=JSON.stringify(template); expect(stored).not.toContain('$900 old');
    expect(readStoredTemplate(stored)).toEqual(template);
    const portfolio=matchPortfolio(template,[account,{...account,id:'act_555',name:'Food'}]);
    expect([...portfolio.matches.keys()]).toEqual([account.id]);
    expect(portfolio.missing.map(c=>c.name)).toEqual(['Other']);
    expect(matchPortfolio(template,[{...account,id:'act_555'}]).matches.size).toBe(0);
    expect(()=>importDailyTemplate('<script>bad()</script>')).toThrow();
  });
  it('maps messaging starts, preserves nulls, and flags a measured regional lead-cost difference',()=>{
    const chat=campaigns.find(c=>c.id==='3')!;
    expect(resultKind(chat)).toBe('conversations');
    expect(chat.conversations).toBe(7);
    expect(chat.formLeads).toBeNull();
    const flags=dailyFindings(account,periods[0]);
    expect(flags.find(f=>f.title==='Cost per lead differs by campaign')?.detail).toMatch(/10.00.*20.00/);
    expect(dailyFact('CPL',account,periods[0],undefined,'LEADS',flags).value).toMatch(/16.29/);
    expect(dailyFact('Video CTR',account,periods[0],undefined,'MIXED',flags).value).toBe('—');
  });
  it('exports both working windows, offline navigation, target portfolio exclusions, and escaped source text',()=>{
    const layout=importDailyTemplate(reference).clients[0];
    const doc=renderDailyDocument([{account,report:{account,generated:'2026-11-11',periods}},{account:{...account,id:'act_999',name:'Closed'},error:'Access denied'}],end,{layouts:{act_123:layout},exclusions:[{name:'Other',reason:'Unavailable'}]});
    for(const label of ['data-window="0"','data-window="1"','data-panel="overview"','Issues &amp; Flags','Recommendations','Cost / Result','Critical Flags','Not in this report (2 brands)','Nov 4 – Nov 10, 2026','Oct 12 – Nov 10, 2026','Access denied']) expect(doc).toContain(label);
    expect(doc).toContain('Message &lt;b&gt;us&lt;/b&gt;');expect(doc).not.toContain('Message <b>us</b>');
    expect(doc).not.toContain('$900 old');
  });
});

