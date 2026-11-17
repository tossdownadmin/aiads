import { NextResponse } from 'next/server';
import { z } from 'zod';
import { analyzeAudit } from '../../../../lib/ai/bedrock';
import { getAccountInsights, getActiveCampaigns, getAdAccounts } from '../../../../lib/meta/read';
import { listApprovedSkills } from '../../../../lib/skills/store';
import { verifyAdminSession } from '../../../../lib/auth';

export const runtime = 'nodejs';
const schema = z.object({
  accountId: z.string().regex(/^act_\d+$/),
  skillName: z.string().min(1),
  period: z.enum(['last_7d', 'last_30d']),
});
type InsightRow = {
  campaign_name: string;
  campaign_id: string;
  account_currency?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  cpc?: string;
  frequency?: string;
  ctr?: string;
  objective?: string;
  actions?: unknown;
  action_values?: unknown;
  purchase_roas?: unknown;
};

export async function POST(request: Request) {
  if (!await verifyAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.META_SYSTEM_USER_TOKEN) return NextResponse.json({ error: 'Add META_SYSTEM_USER_TOKEN in Vercel to run account audits.' }, { status: 503 });
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: 'Invalid audit request' }, { status: 400 });

  try {
    const [skills, accounts] = await Promise.all([listApprovedSkills(), getAdAccounts()]);
    const skill = skills.find(item => item.name === input.data.skillName && item.categories.includes('analysis') && item.platforms.includes('meta') && !item.categories.includes('competitor_intel'));
    if (!skill) return NextResponse.json({ error: 'Choose an approved skill' }, { status: 404 });
    const account = accounts.find(item => item.id === input.data.accountId);
    if (!account) return NextResponse.json({ error: 'That ad account is not available to the connected Meta token' }, { status: 403 });

    const [activeCampaigns, result] = await Promise.all([
      getActiveCampaigns(account.id),
      getAccountInsights(account.id, input.data.period),
    ]);
    const activeIds = new Set(activeCampaigns.map(campaign => campaign.id));
    const rows = (result.data as InsightRow[]).filter(row => activeIds.has(String(row.campaign_id)));
    const rowsByCampaign = new Map(rows.map(row => [String(row.campaign_id), row]));
    const campaigns = activeCampaigns.map(campaign => ({ ...campaign, ...(rowsByCampaign.get(campaign.id) || {}) }));
    const totalSpend = rows.reduce((sum, row) => sum + Number(row.spend || 0), 0);
    const issues = rows.map(row => ({
      campaign: row.campaign_name,
      frequency: Number(row.frequency || 0),
      ctr: Number(row.ctr || 0),
      spend: Number(row.spend || 0),
    })).flatMap(row => [
      ...(row.frequency >= 3 ? ['Frequency elevated'] : []),
      ...(row.ctr > 0 && row.ctr < 0.5 ? ['CTR below 0.5%'] : []),
    ].map(title => ({ title, ...row })));

    const analysis = activeCampaigns.length
      ? await analyzeAudit(skill.body, { id: account.id, name: account.name }, input.data.period, campaigns as Array<Record<string, unknown>>, issues)
      : { status: 'complete' as const, summary: 'No currently active campaigns were returned for this ad account.', findings: [], dataGaps: [] };
    return NextResponse.json({
      skill: { name: skill.name, description: skill.description, sha: skill.sha },
      account: { id: account.id, name: account.name, currency: account.currency, timezone: account.timezone },
      period: input.data.period,
      summary: { campaigns: activeCampaigns.length, totalSpend, currency: rows[0]?.account_currency || account.currency || null },
      campaigns,
      issues,
      analysis,
      notice: 'This audit lists currently active campaigns and joins campaign-level Meta insights for the selected period. It does not inspect ad-set/ad delivery or reconciled analytics and does not write to the account.',
    });
  } catch (error) {
    console.error('Meta audit failed', error instanceof Error ? error.name : 'Unknown error');
    return NextResponse.json({ error: 'The audit could not complete. Check Meta account permissions and the Vercel Function log.' }, { status: 502 });
  }
}
