import { createHash } from 'node:crypto';
import type { SkillRecord } from './types';

const body = `# Meta account audit\n\nRun a read-only, evidence-backed review of Meta Ads campaign insights supplied by this app.\n\n## Scope\n- Review campaign delivery and reported performance for the selected account and date window.\n- Assess spend, impressions, reach, frequency, clicks, CTR, CPC, actions, action values, and purchase ROAS when present.\n- Use the deterministic threshold flags from the application as prompts for investigation, not as universal performance benchmarks.\n- Tie every finding to the campaign and metric evidence provided.\n- Distinguish a verified issue from a hypothesis or a data gap.\n- Give concise next steps for a human operator.\n\n## Guardrails\n- This skill is read-only. Never request or perform account changes, campaign edits, budget changes, pauses, launches, or writes.\n- Do not infer missing conversions, attribution, client goals, margins, or target ROAS. Mark them unknown and explain what is needed.\n- Avoid comparing campaigns with different objectives as if they share one KPI.\n- Treat platform-reported attribution as platform-reported; do not imply it is reconciled with analytics or CRM data.\n- A frequency or CTR threshold alone is a review signal, not proof of fatigue or wasted spend.\n`;

export function getBuiltinMetaAuditSkill(): SkillRecord & { body: string; original: string; files: string[]; trustTier: number } {
  const name = 'meta-account-audit';
  const description = 'Read-only Meta Ads account audit using connected campaign insights, with evidence-linked findings and explicit data gaps.';
  return {
    name,
    description,
    source: 'tossdown-aiads',
    path: 'skills/meta-account-audit/SKILL.md',
    sha: createHash('sha256').update(body).digest('hex'),
    license: 'Proprietary',
    categories: ['analysis', 'monitoring', 'optimization'],
    platforms: ['meta'],
    status: 'staged',
    risk: 'low',
    findings: [],
    writeActions: false,
    adaptationStatus: 'native',
    body,
    original: body,
    files: [],
    trustTier: 1,
  };
}
