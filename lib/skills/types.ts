export const CATEGORIES = ['creation','creative','optimization','analysis','monitoring','alerts','campaign_suggestions','planning','competitor_intel','platform_api'] as const;
export const PLATFORMS = ['meta','google','youtube','tiktok','linkedin','microsoft','multi','platform_agnostic'] as const;
export type Category = typeof CATEGORIES[number];
export type Platform = typeof PLATFORMS[number];
export type SkillStatus = 'staged'|'approved'|'rejected'|'reference_only';
export type Risk = 'low'|'medium'|'high';
export interface SkillFrontmatter { name: string; description: string; license?: string; metadata?: Record<string, unknown>; }
export interface SkillRecord { name: string; description: string; source: string; path: string; sha: string; license?: string; categories: Category[]; platforms: Platform[]; status: SkillStatus; risk: Risk; findings: string[]; writeActions: boolean; adaptationStatus: 'native'|'adapted'|'needs_adaptation'; }
