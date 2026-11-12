import { NextResponse } from 'next/server';
import { getAdAccounts } from '../../../../lib/meta/read';
export const runtime='nodejs';
export async function GET(request:Request){const secret=process.env.CRON_SECRET;if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return NextResponse.json({error:'Unauthorized'},{status:401});try{return NextResponse.json({accounts:await getAdAccounts()})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Meta account lookup failed'},{status:400})}}
