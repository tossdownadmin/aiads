import {NextResponse} from 'next/server';
import {z} from 'zod';
import {paidSourceSession} from '../../../lib/competitors/auth';
import {activeClients} from '../../../config/active-clients';
import {discoverMonitorAccounts} from '../../../lib/monitoring/provider';
import {assignedAccount,monitorSummary,portfolioEntry,refreshAccount} from '../../../lib/monitoring/service';
import {latestMonitor,MonitorConflict,monitorHistory,readMonitorRun,readPrivate} from '../../../lib/monitoring/store';
import type {Period} from '../../../lib/monitoring/types';
export const runtime='nodejs';
export const maxDuration=60;
const periodSchema=z.enum(['7d','30d']);
const reply=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:Request) {
  const session=await paidSourceSession();if(!session)return reply({error:'Sign in to view account monitoring.'},401);
  const url=new URL(request.url),period=periodSchema.safeParse(url.searchParams.get('period')||'7d');
  if(!period.success)return reply({error:'Choose a 7-day or 30-day period.'},400);
  try {
    const accounts=await discoverMonitorAccounts(),id=url.searchParams.get('accountId');
    if(id){
      const account=assignedAccount(accounts,id);
      if(url.searchParams.get('view')==='history')return reply({history:await monitorHistory(id,period.data)});
      const runId=url.searchParams.get('runId'),snapshot=runId?await readMonitorRun(id,period.data,runId):await latestMonitor(id,period.data);
      if(!snapshot)return reply({error:'No saved source snapshot for this account and period.'},404);
      return reply({account,snapshot:url.searchParams.get('view')==='summary'?monitorSummary(snapshot):snapshot});
    }
    const rows=[];
    for(let i=0;i<activeClients.length;i+=3)rows.push(...await Promise.all(activeClients.slice(i,i+3).map(client=>portfolioEntry(client.accountId,client.name,accounts.find(a=>a.id===client.accountId)||null,period.data))));
    const scheduled=await readPrivate<unknown>('monitoring/schedule/latest.json').catch(()=>({value:null}));
    return reply({accounts:rows,period:period.data,actor:session.user!.email,scheduling:{configured:!!process.env.CRON_SECRET,cadence:'07:15 UTC daily; 30-day checks refresh manually',lastRun:scheduled.value},loadedAt:new Date().toISOString()});
  } catch {return reply({error:'Monitoring could not load the Meta connection or saved evidence. Retry loading; no values were substituted.'},503);}
}
export async function POST(request:Request) {
  if(!await paidSourceSession())return reply({error:'Sign in to refresh account monitoring.'},401);
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Use this workspace to refresh monitoring.'},403);
  const input=z.object({accountId:z.string().regex(/^act_\d+$/),period:periodSchema}).strict().safeParse(await request.json().catch(()=>null));
  if(!input.success)return reply({error:'Choose an assigned account and reporting period.'},400);
  try {const account=assignedAccount(await discoverMonitorAccounts(),input.data.accountId),snapshot=await refreshAccount(account,input.data.period as Period);return reply({snapshot:monitorSummary(snapshot)});}
  catch(e){return reply({error:e instanceof MonitorConflict?e.message:'The account refresh could not be saved. Previous evidence remains available; retry this account.'},e instanceof MonitorConflict?409:503);}
}
