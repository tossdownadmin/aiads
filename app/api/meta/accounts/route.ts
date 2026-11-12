import { NextResponse } from 'next/server';
import { getAdAccounts } from '../../../../lib/meta/read';
import { verifyAdminSession } from '../../../../lib/auth';
export const runtime='nodejs';
export async function GET(){if(!await verifyAdminSession())return NextResponse.json({error:'Unauthorized'},{status:401});try{return NextResponse.json({accounts:await getAdAccounts()})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Meta account lookup failed'},{status:400})}}
