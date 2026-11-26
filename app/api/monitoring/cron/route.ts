import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {activeClients} from '../../../../config/active-clients';
import {discoverMonitorAccounts} from '../../../../lib/monitoring/provider';
import {refreshAccount} from '../../../../lib/monitoring/service';
import {readPrivate,writePrivate} from '../../../../lib/monitoring/store';
export const runtime='nodejs';
export const maxDuration=300;
export async function GET(request:Request) {
  const secret=process.env.CRON_SECRET,received=request.headers.get('authorization')||'',expected='Bearer '+secret;
  if(!secret||Buffer.byteLength(received)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(received),Buffer.from(expected)))return NextResponse.json({error:'Unauthorized'},{status:401});
  const startedAt=new Date().toISOString();
  try {
    const prior=await readPrivate<{expiresAt:number}>('monitoring/schedule/lock.json');
    if(prior.value&&prior.value.expiresAt>Date.now())return NextResponse.json({status:'already_running'},{status:409});
    const lockVersion=await writePrivate('monitoring/schedule/lock.json',{expiresAt:Date.now()+290000},prior.version);
    try {
      const accounts=await discoverMonitorAccounts(),results:Array<{id:string;status:string;runId?:string}>=[];let cursor=0;
      await Promise.all(Array.from({length:2},async()=>{while(cursor<activeClients.length){
        const client=activeClients[cursor++],account=accounts.find(a=>a.id===client.accountId);
        if(!account){results.push({id:client.accountId,status:'unavailable'});continue;}
        try{const snapshot=await refreshAccount(account,'7d');results.push({id:account.id,status:snapshot.integrity==='verified'?'saved':'limited',runId:snapshot.id});}
        catch{results.push({id:account.id,status:'failed'});}
      }}));
      const latest=await readPrivate('monitoring/schedule/latest.json');
      const receipt={startedAt,completedAt:new Date().toISOString(),period:'7d',results};await writePrivate('monitoring/schedule/latest.json',receipt,latest.version);
      return NextResponse.json({status:results.some(r=>r.status!=='saved')?'partial':'complete',...receipt});
    } finally {await writePrivate('monitoring/schedule/lock.json',{expiresAt:0},lockVersion).catch(()=>undefined);}
  } catch {return NextResponse.json({error:'Scheduled monitoring failed. Saved account evidence remains available.'},{status:503});}
}
