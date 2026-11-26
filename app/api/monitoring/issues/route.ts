import {NextResponse} from 'next/server';
import {z} from 'zod';
import {paidSourceSession} from '../../../../lib/competitors/auth';
import {discoverMonitorAccounts} from '../../../../lib/monitoring/provider';
import {assignedAccount} from '../../../../lib/monitoring/service';
import {latestMonitor,MonitorConflict,saveIssue} from '../../../../lib/monitoring/store';
const inputSchema=z.object({accountId:z.string().regex(/^act_\d+$/),period:z.enum(['7d','30d']),issueId:z.string().min(1).max(200),version:z.string().min(1).max(200).nullable(),state:z.enum(['open','in_progress','reviewed','dismissed','snoozed']),owner:z.string().trim().max(150),note:z.string().trim().max(2000),snoozedUntil:z.string().datetime().optional()}).strict();
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function PUT(request:Request) {
  const session=await paidSourceSession();if(!session)return reply({error:'Sign in to update the review queue.'},401);
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Use this workspace to update the queue.'},403);
  const input=inputSchema.safeParse(await request.json().catch(()=>null));if(!input.success)return reply({error:'Check the issue, owner, review state and note.'},400);
  const value=input.data;
  if(['reviewed','dismissed','snoozed'].includes(value.state)&&!value.note)return reply({error:'Add a reason or review note for this state.'},400);
  if(value.state==='snoozed'&&(!value.snoozedUntil||Date.parse(value.snoozedUntil)<=Date.now()||Date.parse(value.snoozedUntil)>Date.now()+30*86400000))return reply({error:'Choose a snooze expiry within the next 30 days.'},400);
  try {
    assignedAccount(await discoverMonitorAccounts(),value.accountId);
    const snapshot=await latestMonitor(value.accountId,value.period);
    if(!snapshot?.findings.some(f=>f.id===value.issueId))return reply({error:'This signal is absent from the latest saved run. Reload the queue.'},409);
    return reply(await saveIssue(value.accountId,value.period,{issueId:value.issueId,accountId:value.accountId,state:value.state,owner:value.owner,note:value.note,...(value.state==='snoozed'?{snoozedUntil:value.snoozedUntil}:{}),updatedAt:new Date().toISOString(),updatedBy:session.user!.email!},value.version));
  } catch(e){return reply({error:e instanceof MonitorConflict?e.message:'The review state could not be saved. Reload and retry.'},e instanceof MonitorConflict?409:503);}
}
