import { NextResponse } from 'next/server';
import { BlobPreconditionFailedError, BlobNotFoundError, head, get, put } from '@vercel/blob';
import { z } from 'zod';
import { verifyAdminSession } from '../../../../../lib/auth';
import { getAdAccounts } from '../../../../../lib/meta/read';
import { accountToday, dailyWindows, shiftDay, validDay } from '../../../../../lib/reports/model';
import { readReportWindows } from '../../../../../lib/reports/read';
import { matchPortfolio, readStoredTemplate } from '../../../../../lib/reports/daily-template';
import { renderDailyDocument } from '../../../../../lib/reports/daily-document';
import type { SavedDaily } from '../../../../../lib/reports/saved-daily';

export const runtime = 'nodejs';
export const maxDuration = 300;
const path = 'reports/daily/latest-v1.json';
const reply = (body: unknown, status = 200) => NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const requestShape = z.object({
  version: z.string().max(200).nullable(),
  accountIds: z.array(z.string().regex(/^act_\d+$/)).min(1).optional(),
  date: z.string().refine(validDay).optional(),
  template: z.unknown().optional(),
});
async function latest() {
  let metadata;
  try { metadata=await head(path); }
  catch(error) {
    if(error instanceof BlobNotFoundError) return {saved:null,version:null};
    throw error;
  }
  const file=await get(path,{access:'private',useCache:false});
  if (!file?.stream) throw new Error('Missing report body');
  return {saved:await new Response(file.stream).json() as SavedDaily,version:metadata.etag};
}
export async function GET() {
  if (!await verifyAdminSession()) return reply({error:'Sign in to open the daily report.'},401);
  try {return reply(await latest());}
  catch {return reply({error:'The saved daily report could not be opened.'},503);}
}
export async function POST(request:Request) {
  if (!await verifyAdminSession()) return reply({error:'Sign in to update the daily report.'},401);
  const input=requestShape.safeParse(await request.json().catch(()=>null));
  if (!input.success) return reply({error:'Check the account selection and reporting date.'},400);
  const conflict=()=>reply({error:'Another report was saved. Reload to see the latest version.'},409);
  try {
    const previous=await latest(), data=input.data;
    if (data.version!==previous.version) return conflict();
    const ids=[...new Set(data.accountIds??previous.saved?.accountIds??[])];
    if (!ids.length) return reply({error:'Select accounts for the first report.'},400);
    const template=data.accountIds ? readStoredTemplate(JSON.stringify(data.template)??null) : previous.saved?.template;
    if (data.template && !template) return reply({error:'The report template is invalid.'},400);
    const accounts=await getAdAccounts(), byId=new Map(accounts.map(a=>[a.id,a]));
    if(ids.some(id=>!byId.has(id))) return reply({error:'A selected account is unavailable. Review the account selection.'},403);
    const chosen=ids.map(id=>byId.get(id)!);
    const now=new Date(),savedAt=now.toISOString();
    const today=chosen.map(a=>accountToday(a.timezone,now)).sort()[0];
    const date=data.date??shiftDay(today,-1);
    if(date>=today) return reply({error:'Choose a completed reporting day for all selected accounts.'},400);
    const windows=dailyWindows(date,today);
    const portfolio=matchPortfolio(template,accounts);
    const order=new Map(Array.from(portfolio.matches.keys(),(id,i)=>[id,i]));
    chosen.sort((a,b)=>(order.get(a.id)??Infinity)-(order.get(b.id)??Infinity));
    type Entry=Parameters<typeof renderDailyDocument>[0][number];
    const entries:Entry[]=[];
    let cursor=0, stopped=false;
    async function readNext() {
      while (!stopped && cursor<chosen.length) {
        const index=cursor++, account=chosen[index];
        try {
          const periods=await readReportWindows(account,windows);
          if(periods.some(p=>p.notes.includes('Account totals were unavailable. Campaign rows remain available.'))) throw new Error('Missing totals');
          entries[index]={account,report:{account,generated:savedAt,periods}};
        } catch {stopped=true; throw new Error('Account read failed');}
      }
    }
    await Promise.all([readNext(),readNext()]);
    const exclusions=[...portfolio.missing,...Array.from(portfolio.matches).filter(([id])=>!ids.includes(id)).map(([,client])=>({name:client.name,reason:'Outside the selected accounts for this report.'}))];
    const html=renderDailyDocument(entries,date,{layouts:Object.fromEntries(portfolio.matches),exclusions,template});
    const saved:SavedDaily={date,savedAt,accountIds:ids,template,html};
    const file=await put(path,JSON.stringify(saved),{access:'private',contentType:'application/json',addRandomSuffix:false,allowOverwrite:!!previous.version,...(previous.version?{ifMatch:previous.version}:{})});
    return reply({saved,version:file.etag});
  } catch(error) {
    if(error instanceof BlobPreconditionFailedError) return conflict();
    return reply({error:'The update could not be completed. Your last saved report is still available. Retry or review the account selection.'},502);
  }
}
