import { NextResponse } from 'next/server';
import { z } from 'zod';
import {getAdAccounts} from '../../../../lib/meta/read';
import {listApprovedSkills} from '../../../../lib/skills/store';
import {verifyAdminSession} from '../../../../lib/auth';
import {readDailyReview} from '../../../../lib/reports/read';
import {readClientContext} from '../../../../lib/reports/client-context';
import {accountToday,shiftDay,dailyWindows,type Report} from '../../../../lib/reports/model';
import {analyzeAccountAudit,clientReadiness} from '../../../../lib/reports/audit-analysis';
import {deliveryNotices} from '../../../../lib/reports/review-quality';
export const runtime='nodejs';
export const maxDuration=300;
const schema=z.object({accountId:z.string().regex(/^act_\d+$/),skillName:z.string().min(1).max(120),period:z.enum(['last_7d','last_30d']),scope:z.enum(['period','active']).default('period')});
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(request:Request){
 if(!await verifyAdminSession())return reply({error:'Unauthorized'},401);
 const input=schema.safeParse(await request.json().catch(()=>null));
 if(!input.success)return reply({error:'Choose an account, reporting window, scope and approved method.'},400);
 if(!process.env.META_SYSTEM_USER_TOKEN)return reply({error:'The Meta connection is unavailable.'},503);
 try{
  const [skills,accounts]=await Promise.all([listApprovedSkills(),getAdAccounts()]);
  const skill=skills.find(s=>s.name===input.data.skillName&&s.categories.includes('analysis')&&s.platforms.includes('meta')&&!s.categories.includes('competitor_intel')&&!s.writeActions&&s.risk!=='high');
  if(!skill)return reply({error:'Choose an approved read-only audit method.'},400);
  const account=accounts.find(a=>a.id===input.data.accountId);
  if(!account)return reply({error:'That account is unavailable to this Meta connection.'},403);
  const end=shiftDay(accountToday(account.timezone),-1),window=dailyWindows(end,accountToday(account.timezone))[input.data.period==='last_7d'?0:1];
  const context=await readClientContext(account.id);
  const [snapshot]=await readDailyReview(account,[window],context);
  const campaigns=input.data.scope==='active'?snapshot.campaigns.filter(c=>c.status==='ACTIVE'):snapshot.campaigns;
  const ids=new Set(campaigns.map(c=>c.id));
  const scoped={...snapshot,campaigns,details:Object.fromEntries(Object.entries(snapshot.details??{}).filter(([id])=>ids.has(id)))};
  // A selected subset does not inherit account totals or unrelated comparison rows.
  const selectedSpend=campaigns.length&&campaigns.every(c=>c.spend!==null)?campaigns.reduce((n,c)=>n+c.spend!,0):null;
  if(input.data.scope==='active'){
   scoped.totals=null;
   if(scoped.previous)scoped.previous={...scoped.previous,totals:null,campaigns:scoped.previous.campaigns.filter(c=>ids.has(c.id))};
   scoped.notes=[...scoped.notes,'Only currently active campaigns are selected. Account-wide totals are not used for this subset.'];
  }
  const report:Report={account,generated:new Date().toISOString(),periods:[scoped],reviewContext:context};
  const analysis=await analyzeAccountAudit(report,skill);
  return reply({skill:{name:skill.name,description:skill.description,sha:skill.sha},account,period:input.data.period,window,scope:input.data.scope,summary:{campaigns:campaigns.length,totalSpend:input.data.scope==='period'?snapshot.totals?.spend??null:selectedSpend,currency:account.currency},campaigns:campaigns.map(c=>({...c,effective_status:c.status})),details:scoped.details,issues:[],deliveryNotices:deliveryNotices(account,scoped),readiness:clientReadiness(context,account,end),analysis,notice:'Metrics cover '+window.since+' through '+window.until+' in the account time zone. '+(input.data.scope==='period'?'Includes period results from paused and ended campaigns.':'Spend covers the selected currently active campaigns only.')+' Settings and disapprovals are current at retrieval.'});
 }catch{return reply({error:'The audit evidence or saved business profile could not be loaded. Retry the audit.'},502);}
}
