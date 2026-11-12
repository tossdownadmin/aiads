import { NextResponse } from 'next/server';
import { discoverConfiguredSkills } from '../../../../lib/skills/github';
import { loadSkillSources } from '../../../../lib/skills/config';
import { stageSkills } from '../../../../lib/skills/store';
import { verifyAdminSession } from '../../../../lib/auth';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return runSync();
}
export async function POST() {
  if (!await verifyAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return runSync();
}
async function runSync() {
  try {
    const sources = await loadSkillSources();
    const result = await discoverConfiguredSkills(sources, process.env.GITHUB_TOKEN);
    await stageSkills(result.skills);
    return NextResponse.json({ fetchedAt: new Date().toISOString(), staged: result.skills, errors: result.errors, summary: { found: result.skills.length, highRisk: result.skills.filter(skill => skill.risk === 'high').length, referenceOnly: result.skills.filter(skill => skill.status === 'reference_only').length } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Sync failed' }, { status: 500 }); }
}
