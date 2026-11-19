import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdminSession } from '../../../../lib/auth';
import { clientCatalog } from '../../../../lib/competitors/catalog';
import { readCompetitors } from '../../../../lib/competitors/store';
import { searchForeplay } from '../../../../lib/competitors/foreplay';
import { getAdAccounts } from '../../../../lib/meta/read';
import { accountToday, dailyWindows, planningWindow, type Report } from '../../../../lib/reports/model';
import { draftPlan } from '../../../../lib/reports/plan';
import { readReportWindows, readTracking } from '../../../../lib/reports/read';

export const runtime = 'nodejs';
export const maxDuration = 300;
const accountId = z.string().regex(/^act_\d+$/);
const cap = z.number().positive().max(100000000000).optional();
const inputs = z.object({ cap, previousCap: cap, brief: z.string().trim().max(4000), competitors: z.string().trim().max(4000), event: z.string().trim().max(2000) });
const schema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('daily'), accountId, end: z.string().length(10) }),
  z.object({ mode: z.literal('plan'), accountId, month: z.string().length(7), researchClient: z.enum(clientCatalog.map(c => c.id) as [string, ...string[]]).optional(), inputs, draft: z.boolean().default(true) }),
]);
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function POST(request: Request) {
  if (!await verifyAdminSession()) return json({ error: 'Sign in to read Meta reports.' }, 401);
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return json({ error: 'Check the account, dates, budget and brief lengths.' }, 400);
  if (!process.env.META_SYSTEM_USER_TOKEN) return json({ error: 'The Meta connection is unavailable.' }, 503);
  const data = input.data;
  try {
    const account = (await getAdAccounts()).find(a => a.id === data.accountId);
    if (!account) return json({ error: 'The account is unavailable to this connection.' }, 403);
    const now = new Date();
    const today = accountToday(account.timezone, now);
    let windows;
    try {
      windows = data.mode === 'daily' ? dailyWindows(data.end, today) : [planningWindow(data.month, today)];
    } catch (error) {
      return json({ error: (error as Error).message }, 400);
    }
    const [periods, tracking] = await Promise.all([
      readReportWindows(account, windows),
      data.mode === 'plan' ? readTracking(account.id) : undefined,
    ]);
    const report: Report = { account, generated: now.toISOString(), periods, tracking };
    if (data.mode === 'plan' && data.researchClient) {
      const client = clientCatalog.find(c => c.id === data.researchClient)!;
      const evidence: NonNullable<Report['competitorEvidence']> = { client: client.name, checkedAt: now.toISOString(), coverage: '', ads: [] };
      try {
        const saved = (await readCompetitors(client.id)).filter(c => c.reviewed === true).slice(0,10);
        if (saved.length) {
          const result = await searchForeplay({ brandIds: saved.map(c => c.id), live: 'ACTIVE', format: 'ALL' });
          evidence.coverage = result.coverageNote;
          evidence.ads = result.ads.map(a => ({ id: a.id, advertiser: a.page_name || 'Unlisted', text: (a.ad_creative_bodies[0] || '').slice(0,400), url: a.ad_snapshot_url }));
        } else evidence.coverage = 'No reviewed advertiser matches saved for this client.';
      } catch { evidence.coverage = 'Competitor records were unavailable on this run.'; }
      report.competitorEvidence = evidence;
    }
    if (data.mode === 'plan' && data.draft) {
      try {
        return json({ report, plan: await draftPlan(report, data.month, data.inputs) });
      } catch (error) {
        console.error('Report plan unavailable', { name: error instanceof Error ? error.name : 'Unknown' });
        return json({ report, planError: 'The planning draft could not be generated. The measured report is available. Retry the plan to generate the narrative.' });
      }
    }
    return json({ report });
  } catch (error) {
    console.error('Report read failed', { name: error instanceof Error ? error.name : 'Unknown' });
    return json({ error: 'Meta could not return insights for this account and period. Review its access and retry.' }, 502);
  }
}
