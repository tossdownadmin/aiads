import { parseSkillDocument } from './parse';
import { classifySkill } from './classify';
import { scanSkill } from './scan';
import type { SkillRecord } from './types';

type Source = { repo: string; paths: string[]; trust_tier: number; enabled: boolean };
type TreeEntry = { path: string; type: string; sha: string; url: string };
const API = 'https://api.github.com';

async function githubJson<T>(url: string, token?: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, next: { revalidate: 3600 } });
  if (!response.ok) throw new Error(`GitHub request failed (${response.status}) for ${url}`);
  return response.json() as Promise<T>;
}

export async function discoverConfiguredSkills(sources: Source[], token?: string) {
  const skills: Array<SkillRecord & { body: string; original: string; files: string[]; trustTier: number }> = [];
  const errors: string[] = [];
  for (const source of sources.filter(item => item.enabled)) {
    try {
      const [owner, repo] = source.repo.split('/');
      const repository = await githubJson<{ default_branch: string }>(`${API}/repos/${owner}/${repo}`, token);
      const tree = await githubJson<{ sha: string; tree: TreeEntry[]; truncated: boolean }>(`${API}/repos/${owner}/${repo}/git/trees/${repository.default_branch}?recursive=1`, token);
      const skillsPaths = tree.tree.filter(entry => entry.type === 'blob' && entry.path.endsWith('SKILL.md') && source.paths.some(root => entry.path === root || entry.path.startsWith(`${root}/`)));
      for (const entry of skillsPaths) {
        try {
          const blob = await githubJson<{ content: string; encoding: string }>(`${API}/repos/${owner}/${repo}/git/blobs/${entry.sha}`, token);
          const original = blob.encoding === 'base64' ? Buffer.from(blob.content, 'base64').toString('utf8') : blob.content;
          const parsed = parseSkillDocument(original);
          const classification = classifySkill(parsed.frontmatter.name, parsed.frontmatter.description, parsed.body);
          const siblingFiles = tree.tree.filter(file => file.type === 'blob' && file.path.startsWith(entry.path.replace(/SKILL\.md$/, ''))).map(file => file.path);
          const scan = scanSkill(original, siblingFiles.filter(file => file.includes('/scripts/')).map(file => `scripts/${file}`));
          if (!classification.ads) continue;
          const license = typeof parsed.frontmatter.license === 'string' ? parsed.frontmatter.license : undefined;
          const record: SkillRecord & { body: string; original: string; files: string[]; trustTier: number } = {
            name: parsed.frontmatter.name, description: parsed.frontmatter.description, source: source.repo, path: entry.path,
            sha: tree.sha, license, categories: classification.categories, platforms: classification.platforms,
            status: scan.risk === 'high' ? 'rejected' : license ? 'staged' : 'reference_only', risk: scan.risk,
            findings: scan.findings, writeActions: classification.writeActions,
            adaptationStatus: /mcp|cli/i.test(parsed.body) ? 'needs_adaptation' : 'native',
            body: parsed.body, original, files: siblingFiles, trustTier: source.trust_tier,
          };
          skills.push(record);
        } catch (error) { errors.push(`${source.repo}/${entry.path}: ${error instanceof Error ? error.message : 'parse failed'}`); }
      }
      if (tree.truncated) errors.push(`${source.repo}: GitHub returned a truncated repository tree`);
    } catch (error) { errors.push(`${source.repo}: ${error instanceof Error ? error.message : 'source unavailable'}`); }
  }
  return { skills, errors };
}
