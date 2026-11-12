import { NextResponse } from 'next/server';
import { listApprovedSkills } from '../../../../lib/skills/store';
import { verifyAdminSession } from '../../../../lib/auth';
export const runtime='nodejs';
export async function GET(){if(!await verifyAdminSession())return NextResponse.json({error:'Unauthorized'},{status:401});try{return NextResponse.json({skills:await listApprovedSkills()})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to read skills'},{status:500})}}
