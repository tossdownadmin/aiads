import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { paidSourceSession } from '../../../../lib/competitors/auth';
import { getAdAccounts } from '../../../../lib/meta/read';
import { accountAccess, assets, inventory } from '../../../../lib/meta/management/graph';
import { accountId, objectId, ManagementError } from '../../../../lib/meta/management/types';
import { execute, prepare, publicDraft } from '../../../../lib/meta/management/service';
import { ChangeConflict, history, readDraft } from '../../../../lib/meta/management/store';
import {monitoringReferenceSchema} from '../../../../lib/monitoring/workflow';
export const runtime='nodejs';
export const maxDuration=300;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const knownMessage=(error:unknown)=>error instanceof ZodError?error.issues[0]?.message:'The campaign workspace could not complete this request. Reload the current settings and try again.';
export async function GET(request:Request) {
  const session=await paidSourceSession();if(!session?.user?.email)return reply({error:'Sign in to manage campaigns.'},401);
  const url=new URL(request.url);
  try {
    if(url.searchParams.get('view')==='accounts')return reply({accounts:await getAdAccounts(),editingEnabled:process.env.META_WRITE_ENABLED==='true'});
    const id=accountId.parse(url.searchParams.get('accountId'));
    const view=url.searchParams.get('view')||'campaigns';
    const access=await accountAccess(id);
    if(view==='status')return reply(access);
    if(view==='assets')return reply({access,...await assets(id)});
    if(view==='history')return reply(await history(id));
    if(view==='record') {
      const record=await readDraft(id,url.searchParams.get('id')||'');
      return record?reply(publicDraft(record.draft)):reply({error:'Change record not found.'},404);
    }
    const kind=z.enum(['campaigns','adsets','ads','creatives']).parse(view);
    const parent=url.searchParams.get('parentId');if(parent)objectId.parse(parent);
    return reply({access,items:await inventory(id,({campaigns:'campaign',adsets:'adset',ads:'ad',creatives:'creative'} as const)[kind],parent||undefined)});
  } catch(error){return reply({error:knownMessage(error)},error instanceof ZodError?400:503);}
}
const requestSchema=z.union([
  z.object({action:z.literal('preview'),accountId,operation:z.unknown(),currencyContract:z.literal('meta-offset-v1').optional(),monitoringReference:monitoringReferenceSchema.optional()}).strict(),
  z.object({action:z.literal('execute'),accountId,id:z.string().regex(/^\d{13}-[a-f\d-]{36}$/),digest:z.string().regex(/^[a-f\d]{64}$/),approved:z.literal(true)}).strict(),
]);
export async function POST(request:Request) {
  const session=await paidSourceSession();if(!session?.user?.email)return reply({error:'Sign in to manage campaigns.'},401);
  const origin=request.headers.get('origin');
  if(!origin||origin!==new URL(request.url).origin||!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Apply changes from this workspace.'},403);
  try {
    const text=await request.text();if(Buffer.byteLength(text)>3200000)return reply({error:'The change is too large. Images must be 2 MB or smaller.'},413);
    const input=requestSchema.parse(JSON.parse(text));
    const result=input.action==='preview'?await prepare(input.accountId,session.user.email,input.operation,input.currencyContract||'legacy',input.monitoringReference):await execute(input.accountId,input.id,session.user.email,input.digest);
    return reply(publicDraft(result));
  } catch(error) {
    if(error instanceof ChangeConflict)return reply({error:error.message},409);
    // Domain validation messages contain no Meta diagnostics or credentials.
    return reply({error:error instanceof ManagementError?error.message:knownMessage(error)},error instanceof ZodError||error instanceof SyntaxError?400:error instanceof ManagementError?409:503);
  }
}
