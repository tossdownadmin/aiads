import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdminSession } from '../../../../lib/auth';
import { clientIdSchema } from '../../../../lib/competitors/library';
import { readClientBoard, readCompetitors, readClientCatalog } from '../../../../lib/competitors/store';
import { searchForeplay, searchSavedCompetitors } from '../../../../lib/competitors/foreplay';
import { getAdAccounts, fetchAllPages } from '../../../../lib/meta/read';
import { comparisonWindow, accountToday, dailyWindows, planningWindow, validDay, type Report } from '../../../../lib/reports/model';
import {selectReportSkill} from '../../../../lib/skills/report-runner';
import {analyzeDailyReport,dailyEvidence,partitionDailyEvidence} from '../../../../lib/reports/daily-analysis';
import { draftPlan } from '../../../../lib/reports/plan';
import { readComparison, readReportWindows, readDailyReview, readTracking } from '../../../../lib/reports/read';
import {readClientContext} from '../../../../lib/reports/client-context';

export const runtime = 'nodejs';
export const maxDuration = 300;
const accountId = z.string().regex(/^act_\d+$/);
const cap = z.number().positive().max(100000000000).optional();
const inputs = z.object({ cap, previousCap: cap, brief: z.string().trim().max(4000), competitors: z.string().trim().max(4000), event: z.string().trim().max(2000) });
const schema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('daily'), accountId, skillName:z.string().min(1).max(120).optional(), skillSha:z.string().min(1).max(200).optional(), end: z.string().length(10) }),
  z.object({ mode: z.literal('plan'), accountId, month: z.string().length(7), researchClient: clientIdSchema.optional(), skillName:z.string().min(1).max(120).optional(), skillSha:z.string().min(1).max(200).optional(), inputs, draft: z.boolean().default(true) }),
]);
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
// Authenticated read-only reconciliation of the fields used by Ads Manager.
export async function GET(request:Request) {
  if(!await verifyAdminSession())return json({error:'Sign in to read Meta reports.'},401);
  const q=new URL(request.url).searchParams;
  const id=q.get('accountId')||'',since=q.get('since')||'',until=q.get('until')||'';
  if(!/^act_\d+$/.test(id)||!validDay(since)||!validDay(until)||since>until||Date.parse(until)-Date.parse(since)>93*86400000)return json({error:'Choose an account and a reporting window of at most 94 days.'},400);
  try {
    const account=(await getAdAccounts()).find(a=>a.id===id);
    if(!account)return json({error:'The account is unavailable to this connection.'},403);
    const rows=await fetchAllPages(id+'/insights',{level:'adset',time_range:JSON.stringify({since,until}),use_unified_attribution_setting:'true',fields:'campaign_id,campaign_name,adset_id,adset_name,spend,actions,results,cost_per_result,attribution_setting',limit:'200'});
    return json({account:{id:account.id,name:account.name,currency:account.currency,timezone:account.timezone},window:{since,until},rows});
  }catch{return json({error:'Meta could not return the requested result evidence.'},502);}
}
export async function POST(request: Request) {
  if (!await verifyAdminSession()) return json({ error: 'Sign in to read Meta reports.' }, 401);
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return json({ error: 'Check the account, dates, budget and brief lengths.' }, 400);
  if (!process.env.META_SYSTEM_USER_TOKEN) return json({ error: 'The Meta connection is unavailable.' }, 503);
  const data = input.data;
  try {
    const account = (await getAdAccounts()).find(a => a.id === data.accountId);
    if (!account) return json({ error: 'The account is unavailable to this connection.' }, 403);
    const researchClient=data.mode==='plan'&&data.researchClient?(await readClientCatalog()).value.clients.find(c=>c.id===data.researchClient):undefined;
    if(data.mode==='plan'&&data.researchClient&&!researchClient)return json({error:'Choose a client from the current competitor library.'},400);
    if(researchClient?.metaAccountId&&researchClient.metaAccountId!==account.id)return json({error:'The competitor library belongs to a different Meta ad account.'},400);
    const skill=data.mode==='daily'?await selectReportSkill('daily',data.skillName):data.draft?await selectReportSkill('monthly',data.skillName):undefined;
    if(data.skillSha&&skill&&data.skillSha!==skill.sha)return json({error:'The reporting skill version changed. Reload the skill list and review the new version.'},400);
    const now = new Date();
    const today = accountToday(account.timezone, now);
    let windows;
    try {
      windows = data.mode === 'daily' ? dailyWindows(data.end, today) : [planningWindow(data.month, today)];
    } catch (error) {
      return json({ error: (error as Error).message }, 400);
    }
    let reviewContext:Report['reviewContext'];
    {
      try {
        reviewContext=await readClientContext(account.id);
      } catch {
        return json({error:'Saved business context could not be loaded. Retry to use the saved goals and targets.'},503);
      }
    }
    const [periods, tracking, comparison] = await Promise.all([
      data.mode==='daily'?readDailyReview(account, windows,reviewContext):readReportWindows(account, windows),
      data.mode === 'plan' ? readTracking(account.id) : undefined,
      data.mode === 'plan' ? readComparison(account.id,comparisonWindow(windows[0])).catch(()=>({window:comparisonWindow(windows[0]),totals:null})) : undefined,
    ]);
    const report: Report = { account, generated: now.toISOString(), periods, tracking, comparison, reviewContext };
    if(data.mode==='daily') {
      if(partitionDailyEvidence(dailyEvidence(report)).length>1) return json({error:'This account requires multiple analysis batches. Use saved daily report update for resumable analysis.'},409);
      const analysis=await analyzeDailyReport(report,skill!);report.periods=report.periods.map((p,i)=>({...p,analysis:{findings:analysis.periods.find(a=>a.periodId==='window'+i)!.findings,notes:analysis.periods.find(a=>a.periodId==='window'+i)?.notes}}));report.dailySkillRun=analysis.run;
    }
    if (data.mode === 'plan' && data.researchClient) {
      const client = researchClient;
      if(!client)return json({error:'Choose a client from the current competitor library.'},400);
      const evidence: NonNullable<Report['competitorEvidence']> = { client: client.name, checkedAt: now.toISOString(), coverage: '', ads: [] };
      try {
        const board=await readClientBoard(client.id);
        const saved = board ? [] : (await readCompetitors(client.id)).filter(c => c.reviewed === true).slice(0,10);
        if (saved.length || board) {
          const result = board ? await searchForeplay({ boardId:board.id, boardAdvertisers:true, brandIds:[], live:'ACTIVE',format:'ALL' }) : await searchSavedCompetitors(saved,{live:'ACTIVE',format:'ALL'});
          evidence.coverage = (board?board.name+' · ':'')+result.coverageNote;
          evidence.ads = result.ads.map(a => ({ id: a.id, advertiser: a.page_name || 'Unlisted', text: (a.ad_creative_bodies[0] || '').slice(0,400), url: a.ad_snapshot_url, format:a.display_format, cta:a.ad_creative_link_descriptions[0], transcript:a.transcript_excerpt }));
        } else evidence.coverage = 'No reviewed advertiser matches saved for this client.';
      } catch { evidence.coverage = 'Competitor records were unavailable on this run.'; }
      report.competitorEvidence = evidence;
    }
    if (data.mode === 'plan' && data.draft) {
      try {
        return json({ report, plan: await draftPlan(report, data.month, data.inputs,skill) });
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
