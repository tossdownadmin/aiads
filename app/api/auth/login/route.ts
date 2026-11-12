import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, createAdminCookie, validateAdminPassword } from '../../../../lib/auth';
export const runtime='nodejs';
export async function POST(request:Request){const body=await request.json().catch(()=>null);if(!body||typeof body.password!=='string'||!validateAdminPassword(body.password))return NextResponse.json({error:'Invalid sign-in'},{status:401});const response=NextResponse.json({ok:true});response.cookies.set(ADMIN_COOKIE,createAdminCookie(),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:7*24*60*60});return response;}
