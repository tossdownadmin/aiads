import { get, list, put } from '@vercel/blob';
import type { SkillRecord } from './types';
const PREFIX = 'skills/staging/';
const APPROVED_PREFIX = 'skills/approved/';
type Stored = SkillRecord & { body: string; original: string; files: string[]; fetchedAt: string };
export async function stageSkills(skills: Array<SkillRecord & { body: string; original: string; files: string[] }>) {
  for (const skill of skills) {
    const key = `${PREFIX}${encodeURIComponent(skill.source)}/${encodeURIComponent(skill.name)}/${skill.sha}.json`;
    const stored: Stored = { ...skill, fetchedAt: new Date().toISOString() };
    await put(key, JSON.stringify(stored), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
  }
}
export async function listStagedSkills(): Promise<Array<Stored & { pathname: string }>> {
  const result = await list({ prefix: PREFIX });
  const rows = await Promise.all(result.blobs.map(async blob => {
    const response = await get(blob.pathname, { access: 'private', useCache: false });
    if (!response) return null;
    const content = await new Response(response.stream).text();
    return { ...(JSON.parse(content) as Stored), pathname: blob.pathname };
  }));
  return rows.filter((row): row is Stored & { pathname: string } => row !== null);
}
export async function listApprovedSkills(): Promise<Stored[]> {
  const result = await list({ prefix: APPROVED_PREFIX });
  const rows = await Promise.all(result.blobs.map(async blob => {
    const response = await get(blob.pathname, { access: 'private', useCache: false });
    return response ? JSON.parse(await new Response(response.stream).text()) as Stored : null;
  }));
  return rows.filter((row): row is Stored => row !== null);
}
export async function decideSkill(pathname: string, decision: 'approved' | 'rejected') {
  if (!pathname.startsWith(PREFIX) || !pathname.endsWith('.json')) throw new Error('Invalid staged skill path');
  const response = await get(pathname, { access: 'private', useCache: false });
  if (!response) throw new Error('Staged skill version not found');
  const skill = JSON.parse(await new Response(response.stream).text()) as Stored;
  if (decision === 'approved' && (skill.risk === 'high' || skill.status === 'reference_only')) throw new Error('High risk or unlicensed reference-only skills cannot be approved');
  skill.status = decision;
  const target = `${decision === 'approved' ? 'skills/approved/' : 'skills/rejected/'}${encodeURIComponent(skill.source)}/${encodeURIComponent(skill.name)}/${skill.sha}.json`;
  await put(target, JSON.stringify({ ...skill, reviewedAt: new Date().toISOString() }), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
  return { name: skill.name, status: skill.status, sha: skill.sha };
}
