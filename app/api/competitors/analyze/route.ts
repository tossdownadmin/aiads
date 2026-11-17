import { NextResponse } from 'next/server';
import { z } from 'zod';
import { analyzeCompetitorAds } from '../../../../lib/ai/bedrock';
import { listApprovedSkills } from '../../../../lib/skills/store';
import { verifyAdminSession } from '../../../../lib/auth';
import { verifyPaidSourceSession } from '../../../../lib/competitors/access';

export const runtime = 'nodejs';

const adSchema = z.object({
  id: z.string().max(80),
  page_name: z.string().max(200).optional(),
  ad_creation_time: z.string().max(80).optional(),
  ad_delivery_start_time: z.string().max(80).optional(),
  ad_delivery_stop_time: z.string().max(80).optional(),
  ad_creative_bodies: z.array(z.string().max(3000)).max(5).optional(),
  ad_creative_link_titles: z.array(z.string().max(500)).max(5).optional(),
  ad_creative_link_descriptions: z.array(z.string().max(1000)).max(5).optional(),
  ad_creative_link_captions: z.array(z.string().max(500)).max(5).optional(),
  publisher_platforms: z.array(z.string().max(40)).max(10).optional(),
});

const schema = z.object({
  source: z.enum(['meta', 'foreplay']).default('meta'),
  skillName: z.string().min(1).max(120),
  terms: z.string().max(100),
  country: z.string().regex(/^[A-Z]{2}$/),
  ads: z.array(adSchema).min(1).max(12),
});

export async function POST(request: Request) {
  if (!await verifyAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Choose up to 12 valid ad records and an approved competitor skill.' }, { status: 400 });
  if (parsed.data.source === 'foreplay' && !await verifyPaidSourceSession()) return NextResponse.json({ error: 'Foreplay analysis requires an authenticated user session.' }, { status: 403 });

  try {
    const skills = await listApprovedSkills();
    const skill = skills.find(item => item.name === parsed.data.skillName && item.categories.includes('competitor_intel'));
    if (!skill) return NextResponse.json({ error: 'Approve a competitor-intelligence skill in the registry before analysis.' }, { status: 403 });
    const source = parsed.data.source === 'foreplay' ? 'Foreplay Brand Ads API' : 'Meta Ad Library API';
    const analysis = await analyzeCompetitorAds(skill.body, { terms: parsed.data.terms, country: parsed.data.country, source }, parsed.data.ads);
    return NextResponse.json({ skill: { name: skill.name, sha: skill.sha }, source, analysis }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Competitor analysis could not complete. Check the skill registry and Bedrock configuration.' }, { status: 500 });
  }
}
