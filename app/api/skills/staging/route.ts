import { NextResponse } from 'next/server';
import { listStagedSkills } from '../../../../lib/skills/store';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const secret = process.env.SKILLS_SYNC_CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try { return NextResponse.json({ skills: await listStagedSkills() }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load staged skills' }, { status: 500 }); }
}
