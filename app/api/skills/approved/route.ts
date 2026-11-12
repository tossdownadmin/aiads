import { NextResponse } from 'next/server';
import { listApprovedSkills } from '../../../../lib/skills/store';
export const runtime='nodejs';
export async function GET(request:Request){const secret=process.env.CRON_SECRET;if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return NextResponse.json({error:'Unauthorized'},{status:401});try{return NextResponse.json({skills:await listApprovedSkills()})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to read skills'},{status:500})}}
