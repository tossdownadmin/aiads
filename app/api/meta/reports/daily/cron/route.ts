import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {workDailyPending} from '../../../../../../lib/reports/daily-jobs';
export const runtime='nodejs';
export const maxDuration=300;
export async function GET(request:Request) {
  const secret=process.env.CRON_SECRET,received=request.headers.get('authorization')||'',expected='Bearer '+secret;
  if(!secret||Buffer.byteLength(received)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(received),Buffer.from(expected)))return NextResponse.json({error:'Unauthorized'},{status:401});
  try{return NextResponse.json(await workDailyPending(),{headers:{'Cache-Control':'no-store'}});}
  catch{return NextResponse.json({error:'The report checkpoint could not be processed. Saved progress is retained.'},{status:503});}
}
