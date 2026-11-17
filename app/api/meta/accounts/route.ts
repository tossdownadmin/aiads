import { NextResponse } from 'next/server';
import { getAdAccounts } from '../../../../lib/meta/read';
import { verifyAdminSession } from '../../../../lib/auth';
export const runtime='nodejs';
export async function GET(){
  if(!await verifyAdminSession()) return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!process.env.META_SYSTEM_USER_TOKEN) return NextResponse.json({error:'Add META_SYSTEM_USER_TOKEN in Vercel to connect Meta accounts.'},{status:503});
  try{return NextResponse.json({accounts:await getAdAccounts()},{headers:{'Cache-Control':'private, no-store'}})}
  catch(error){console.error('Meta account lookup failed',error instanceof Error?error.name:'Unknown error');return NextResponse.json({error:'Meta account lookup failed. Check system user access and the Vercel Function log.'},{status:502})}
}
