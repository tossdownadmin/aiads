import { parse } from 'yaml';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
export async function loadSkillSources() {
  const raw = await readFile(path.join(process.cwd(), 'config/skill_sources.yaml'), 'utf8');
  const config = parse(raw) as { sources: Array<{ repo: string; paths: string[]; trust_tier: number; enabled: boolean }> };
  return config.sources;
}
