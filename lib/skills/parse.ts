import { parse as parseYaml } from 'yaml';
import type { SkillFrontmatter } from './types';

export function parseSkillDocument(input: string): { frontmatter: SkillFrontmatter; body: string } {
  const match = input.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) throw new Error('Skill is missing YAML frontmatter');
  const data = parseYaml(match[1]) as Partial<SkillFrontmatter>;
  if (typeof data?.name !== 'string' || typeof data?.description !== 'string') throw new Error('Skill frontmatter requires name and description');
  return { frontmatter: data as SkillFrontmatter, body: match[2] };
}
