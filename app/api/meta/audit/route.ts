import { NextResponse } from 'next/server';
import { z } from 'zod';
import { analyzeAudit } from '../../../../lib/ai/bedrock';
import { getAccountInsights, getAdAccounts } from '../../../../lib/meta/read';
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
  account_currency?: string;
  spend?: string;
  frequency?: string;
  ctr?: string;
};

export async function POST(request: Request) {
  if (!await verifyAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: 'Invalid audit request' }, { status: 400 });

  try {
    const [skills, accounts] = await Promise.all([listApprovedSkills(), getAdAccounts()]);
    const skill = skills.find(item => item.name === input.data.skillName);
    if (!skill) return NextResponse.json({ error: 'Choose an approved skill' }, { status: 404 });
    const account = accounts.find(item => item.id === input.data.accountId);
    if (!account) return NextResponse.json({ error: 'That ad account is not available to the connected Meta token' }, { status: 403 });

    const result = await getAccountInsights(account.id, input.data.period);
    const rows = result.data as InsightRow[];
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

    const analysis = await analyzeAudit(skill.body, { id: account.id, name: account.name }, input.data.period, rows as Array<Record<string, unknown>>, issues);
    return NextResponse.json({
      skill: { name: skill.name, description: skill.description, sha: skill.sha },
      account: { id: account.id, name: account.name, currency: account.currency, timezone: account.timezone },
      period: input.data.period,
      summary: { campaigns: rows.length, totalSpend, currency: rows[0]?.account_currency || account.currency || null },
      campaigns: rows,
      issues,
      analysis,
      notice: 'This audit reads Meta campaign insights only. It does not write to or change the ad account.',
    });
  } catch {
    return NextResponse.json({ error: 'The audit could not complete. Check the Meta connection and try again.' }, { status: 400 });
  }
}
