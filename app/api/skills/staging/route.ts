import { NextResponse } from 'next/server';
import { listStagedSkills } from '../../../../lib/skills/store';
import { verifyAdminSession } from '../../../../lib/auth';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  if (!await verifyAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try { return NextResponse.json({ skills: await listStagedSkills() }, { headers: { 'Cache-Control': 'no-store, max-age=0' } }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load staged skills' }, { status: 500 }); }
}
