import { get, list, put } from '@vercel/blob';
import type { SkillRecord } from './types';
import { getBuiltinSkills } from './builtin';
const PREFIX = 'skills/staging/';
const APPROVED_PREFIX = 'skills/approved/';
type Stored = SkillRecord & { body: string; original: string; files: string[]; fetchedAt: string };
async function listAll(prefix: string) {
  const blobs: Awaited<ReturnType<typeof list>>['blobs'] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}
export async function stageSkills(skills: Array<SkillRecord & { body: string; original: string; files: string[] }>) {
  const existing = new Set((await listAll(PREFIX)).map(blob => blob.pathname));
  for (const skill of skills) {
    const key = `${PREFIX}${encodeURIComponent(skill.source)}/${encodeURIComponent(skill.name)}/${skill.sha}.json`;
    if (existing.has(key)) continue;
    const stored: Stored = { ...skill, fetchedAt: new Date().toISOString() };
    await put(key, JSON.stringify(stored), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
  }
}
export async function listStagedSkills(): Promise<Array<Stored & { pathname: string }>> {
  const rows = await Promise.all((await listAll(PREFIX)).map(async blob => {
    const response = await get(blob.url, { access: 'private', useCache: false });
    if (!response) return null;
    const content = await new Response(response.stream).text();
    return { ...(JSON.parse(content) as Stored), pathname: blob.pathname };
  }));
  const pending = rows.filter((row): row is Stored & { pathname: string } => row !== null && row.source !== 'tossdown-aiads' && (row.status === 'staged' || row.status === 'reference_only'));
  const latest = new Map<string, Stored & { pathname: string }>();
  for (const row of pending.sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))) {
    const key = `${row.source}/${row.name}`;
    if (!latest.has(key)) latest.set(key, row);
  }
  return [...latest.values()];
}
export async function listApprovedSkills(): Promise<Stored[]> {
  const rows = await Promise.all((await listAll(APPROVED_PREFIX)).map(async blob => {
    const response = await get(blob.url, { access: 'private', useCache: false });
    return response ? JSON.parse(await new Response(response.stream).text()) as Stored : null;
  }));
  const latest = new Map<string, Stored>();
  for (const row of rows.filter((row): row is Stored => row !== null && row.source !== 'tossdown-aiads').sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))) {
    const key = `${row.source}/${row.name}`;
    if (!latest.has(key)) latest.set(key, row);
  }
  return [...getBuiltinSkills(), ...latest.values()];
}
export async function decideSkill(pathname: string, decision: 'approved' | 'rejected') {
  if (!pathname.startsWith(PREFIX) || !pathname.endsWith('.json')) throw new Error('Invalid staged skill path');
  const { blobs } = await list({ prefix: pathname });
  const file = blobs.find(blob => blob.pathname === pathname);
  if (!file) throw new Error('Staged skill version not found');
  const response = await get(file.url, { access: 'private', useCache: false });
  if (!response) throw new Error('Staged skill version not found');
  const skill = JSON.parse(await new Response(response.stream).text()) as Stored;
  if (skill.source === 'tossdown-aiads') throw new Error('First-party skills are versioned in the application');
  if (decision === 'approved' && (skill.risk === 'high' || skill.status === 'reference_only')) throw new Error('High risk or unlicensed reference-only skills cannot be approved');
  skill.status = decision;
  await put(pathname, JSON.stringify(skill), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
  const target = `${decision === 'approved' ? 'skills/approved/' : 'skills/rejected/'}${encodeURIComponent(skill.source)}/${encodeURIComponent(skill.name)}/${skill.sha}.json`;
  await put(target, JSON.stringify({ ...skill, reviewedAt: new Date().toISOString() }), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
  return { name: skill.name, status: skill.status, sha: skill.sha };
}
