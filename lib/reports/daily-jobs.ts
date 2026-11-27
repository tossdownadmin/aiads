import { randomUUID } from "node:crypto";
import {
  BlobNotFoundError,
  BlobPreconditionFailedError,
  get,
  head,
  put,
} from "@vercel/blob";
import { getAdAccounts, type MetaAccount } from "../meta/read";
import { accountToday, dailyWindows, shiftDay, type Report } from "./model";
import {
  matchPortfolio,
  readStoredTemplate,
  type DailyTemplate,
} from "./daily-template";
import { renderDailyDocument } from "./daily-document";
import { readDailyReview } from "./read";
import {readClientContext} from './client-context';
import { analyzeDailyReport,DailyReviewProgress,type DailyReviewCheckpoint } from "./daily-analysis";
import { selectReportSkill } from "../skills/report-runner";
import { skillVersion, type ReportingSkill } from "../skills/report-packages";
import type { SkillRun } from "../skills/report-types";
import type { SavedDaily } from "./saved-daily";
import { activePortfolio, activePortfolioId, activeReportTemplate } from '../../config/active-clients';
import {describeDailyFailure,type DailyFailure,type DailyStage} from './daily-failure';

const savedPath = "reports/daily/latest-v1.json",
  jobPath = "reports/daily/pending-v1.json";
export class DailyConflict extends Error {}
export class DailyInputError extends Error {}
class DailyContextUnavailable extends Error {}
type Entry = { account: MetaAccount; report: Report; run: SkillRun };
type BlockedAccount = {id:string;name:string;failure:DailyFailure;error:string};
type DailyJob = {
  blocked?:BlockedAccount[];
  id: string;
  status: "running" | "failed" | "complete" | "cancelled";
  createdAt: string;
  updatedAt: string;
  date: string;
  accountIds: string[];
  template?: DailyTemplate;
  portfolioId?: string;
  baseVersion: string | null;
  skill: ReportingSkill;
  completed: { id: string; name: string; path: string; run: SkillRun }[];
  lease?: { token: string; until: number };
  error?: string;
  currentReview?:{done:number;total:number};
  failure?:DailyFailure;
};
export type PublicDailyJob = {
  blocked?:BlockedAccount[];
  background:boolean;
  id: string;
  status: DailyJob["status"];
  date: string;
  done: number;
  total: number;
  nextAccount?: string;
  skill: ReturnType<typeof skillVersion>;
  leaseUntil?: number;
  error?: string;
  currentReview?:{done:number;total:number};
  failure?:DailyFailure;
};
const nextAccount = (job:DailyJob) => job.accountIds.find(id=>!job.completed.some(item=>item.id===id)&&!job.blocked?.some(item=>item.id===id));
const publicJob = (job: DailyJob): PublicDailyJob => ({
  blocked:job.blocked,
  background:!!process.env.CRON_SECRET,
  id: job.id,
  status: job.status,
  date: job.date,
  done: job.completed.length,
  total: job.accountIds.length,
  nextAccount: nextAccount(job),
  skill: skillVersion(job.skill),
  leaseUntil: job.lease?.until,
  error: job.error,
  currentReview:job.currentReview,
  failure:job.failure,
});
async function read<T>(
  path: string,
): Promise<{ value: T | null; version: string | null }> {
  let info;
  try {
    info = await head(path);
  } catch (error) {
    if (error instanceof BlobNotFoundError)
      return { value: null, version: null };
    throw error;
  }
  const file = await get(path, { access: "private", useCache: false });
  if (!file?.stream) throw Error("Stored report unavailable");
  return {
    value: (await new Response(file.stream).json()) as T,
    version: info.etag,
  };
}
async function write(path: string, value: unknown, version: string | null) {
  try {
    return (
      await put(path, JSON.stringify(value), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: !!version,
        contentType: "application/json",
        ...(version ? { ifMatch: version } : {}),
      })
    ).etag;
  } catch (error) {
    if (
      error instanceof BlobPreconditionFailedError ||
      (error instanceof Error && /already exists/i.test(error.message))
    )
      throw new DailyConflict(
        "Another update changed this report. Reload before continuing.",
      );
    throw error;
  }
}
export async function dailyState() {
  const [saved, pending] = await Promise.all([
    read<SavedDaily>(savedPath),
    read<DailyJob>(jobPath),
  ]);
  return {
    saved: saved.value,
    version: saved.version,
    job: pending.value
      ? {
          ...publicJob(pending.value),
          ...(saved.value?.jobId === pending.value.id
            ? { status: "complete" as const }
            : {}),
        }
      : null,
  };
}
export async function startDaily(input: {
  version: string | null;
  accountIds?: string[];
  date?: string;
  template?: unknown;
  skillName?: string;
  skillSha?: string;
}) {
  const [previous, pending] = await Promise.all([
    read<SavedDaily>(savedPath),
    read<DailyJob>(jobPath),
  ]);
  if (input.version !== previous.version)
    throw new DailyConflict(
      "A newer report was saved. Reload before starting an update.",
    );
  if (pending.value?.status === "running")
    throw new DailyConflict(
      "An update is already pending. Resume or discard it first.",
    );
  const accounts = await getAdAccounts(),
    byId = new Map(accounts.map((a) => [a.id, a]));
  const assigned=activePortfolio(accounts);
  const customRefresh=!input.accountIds&&previous.value?.portfolioId==='custom';
  const ids=[...new Set(input.accountIds ?? (customRefresh?previous.value!.accountIds:assigned.accountIds))];
  if (!ids.length) throw new DailyInputError("No assigned reporting accounts are available to this Meta connection.");
  if (ids.some((id) => !byId.has(id)))
    throw new DailyInputError(
      "A selected account is unavailable to the Meta connection.",
    );
  const template = input.accountIds
    ? readStoredTemplate(JSON.stringify(input.template) ?? null)
    : customRefresh?previous.value?.template:activeReportTemplate(previous.value?.template);
  if (input.template && !template)
    throw new DailyInputError("The report template is invalid.");
  const chosen = ids.map((id) => byId.get(id)!);
  const today = chosen.map((a) => accountToday(a.timezone)).sort()[0],
    date = input.date ?? shiftDay(today, -1);
  try {
    dailyWindows(date, today);
  } catch {
    throw new DailyInputError(
      "Choose a completed reporting day for all selected accounts.",
    );
  }
  const skill = await selectReportSkill(
    "daily",
    input.skillName || previous.value?.skill?.name,
  );
  if(input.skillSha&&input.skillSha!==skill.sha)throw new DailyInputError('The reporting skill version changed. Reload the skill list and review the new version.');
  const portfolio = matchPortfolio(template, accounts),
    order = new Map(Array.from(portfolio.matches.keys(), (id, i) => [id, i]));
  chosen.sort(
    (a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity),
  );
  const now = new Date().toISOString();
  const job: DailyJob = {
    id: randomUUID(),
    status: "running",
    createdAt: now,
    updatedAt: now,
    date,
    accountIds: chosen.map((a) => a.id),
    template,
    portfolioId:ids.length===assigned.accountIds.length&&ids.every(id=>(assigned.accountIds as string[]).includes(id))?activePortfolioId:'custom',
    baseVersion: previous.version,
    skill,
    completed: [],
  };
  if (previous.value)
    await write(
      "reports/daily/jobs/" + job.id + "/previous.json",
      previous.value,
      null,
    );
  await write(jobPath, job, pending.version);
  return { job: publicJob(job) };
}
export async function discardDaily(id: string) {
  const current = await read<DailyJob>(jobPath);
  if (!current.value || current.value.id !== id)
    throw new DailyConflict("This pending update changed. Reload the report.");
  if (current.value.lease && current.value.lease.until > Date.now())
    throw new DailyConflict(
      "An account is still being processed. Wait for that batch before discarding.",
    );
  const job = {
    ...current.value,
    status: "cancelled" as const,
    error: undefined,
    failure:undefined,
  };
  await write(jobPath, job, current.version);
  return { job: publicJob(job) };
}
export async function resumeDailyJob(id:string) {
  const current=await read<DailyJob>(jobPath),job=current.value;
  if(!job||job.id!==id||job.status==='cancelled'||job.status==='complete')throw new DailyConflict('This update is unavailable. Reload the report.');
  if(job.lease&&job.lease.until>Date.now())return {job:publicJob(job),processing:true};
  if(job.status==='running')return {job:publicJob(job)};
  const next={...job,status:'running' as const,blocked:[],error:undefined,failure:undefined,updatedAt:new Date().toISOString()};
  await write(jobPath,next,current.version);
  return {job:publicJob(next)};
}
/** One durable checkpoint per invocation; cron recovers an expired worker lease. */
export async function workDailyPending(expectedId?:string) {
  const pending=await read<DailyJob>(jobPath),job=pending.value;
  if(!job||job.status!=='running'||expectedId&&job.id!==expectedId)return {status:'idle'};
  try {const result=await advanceDaily(job.id);return {status:result.job.status,done:result.job.done,total:result.job.total};}
  catch(error){if(error instanceof DailyConflict)return {status:'changed'};throw error;}
}
export async function advanceDaily(id: string) {
  const current = await read<DailyJob>(jobPath);
  let job = current.value;
  if (!job || job.id !== id || job.status === "cancelled")
    throw new DailyConflict(
      "The pending update is unavailable. Reload the saved report.",
    );
  const previous = await read<SavedDaily>(savedPath);
  if (previous.value?.jobId === id)
    return {
      saved: previous.value,
      version: previous.version,
      job: { ...publicJob(job), status: "complete" as const },
    };
  if (previous.version !== job.baseVersion)
    throw new DailyConflict(
      "A different report was saved while this update was pending. Start a new update.",
    );
  if (job.lease && job.lease.until > Date.now())
    return { job: publicJob(job), processing: true };
  if(job.status==='failed')job={...job,blocked:[]};
  const lease = { token: randomUUID(), until: Date.now() + 330000 };
  const leased = {
    ...job,
    status: "running" as const,
    lease,
    error: undefined,
    failure:undefined,
    updatedAt: new Date().toISOString(),
  };
  const leaseVersion = await write(jobPath, leased, current.version);
  let failedAccount = "",failedId="";
  let stage:DailyStage='accounts';
  try {
    const accounts = await getAdAccounts(),
      byId = new Map(accounts.map((a) => [a.id, a]));
    const nextId = nextAccount(job);
    if (nextId) {
      failedId=nextId;
      const account = byId.get(nextId);
      failedAccount = account?.name||nextId;
      if(!account)throw Error("Account access changed");
      const path = "reports/daily/jobs/" + job.id + "/" + nextId + ".json";
      stage='saving';
      let entry = (await read<Entry>(path)).value;
      if (!entry) {
        const inputPath=path.replace(/\.json$/,'-input.json');
        let prepared=(await read<{report:Report;skillHash:string}>(inputPath)).value;
        if(!prepared){
          stage='context';
          let reviewContext:Report['reviewContext'];
          try {
            reviewContext=await readClientContext(account.id);
          } catch {
            throw new DailyContextUnavailable('Saved business context could not be loaded.');
          }
          stage='evidence';
          const generated = new Date().toISOString(),periods = await readDailyReview(
            account,
            dailyWindows(job.date, shiftDay(job.date, 1)),
            reviewContext,
          );
          prepared={report:{ account, generated, periods, reviewContext },skillHash:skillVersion(job.skill).packageHash};
          stage='saving';
          await write(inputPath,prepared,null);
        }
        if(prepared.skillHash!==skillVersion(job.skill).packageHash)throw Error('Prepared evidence does not match the pinned skill');
        const report=prepared.report;
        const checkpoint:DailyReviewCheckpoint={
          load:async key=>(await read<Awaited<ReturnType<DailyReviewCheckpoint['load']>>>(path.replace(/\.json$/,'')+'/batches/'+key+'.json')).value,
          save:async(key,value)=>{await write(path.replace(/\.json$/,'')+'/batches/'+key+'.json',value,null);},
        };
        stage='analysis';
        const analysis = await analyzeDailyReport(report, job.skill,checkpoint);
        report.periods = report.periods.map((p, i) => ({
          ...p,
          analysis: {
            findings: analysis.periods.find((a) => a.periodId === "window" + i)!
              .findings,
            notes:analysis.periods.find(a=>a.periodId==='window'+i)?.notes,
          },
        }));
        entry = { account, report, run: analysis.run };
        stage='saving';
        await write(path, entry, null);
      }
      if (
        entry.account.id !== nextId ||
        entry.run.skill.packageHash !== skillVersion(job.skill).packageHash
      )
        throw Error("Stored account evidence does not match the pinned skill");
      leased.completed = [
        ...job.completed,
        { id: nextId, name: entry.account.name, path, run: entry.run },
      ];
      leased.currentReview=undefined;
    }
    if (leased.completed.length < job.accountIds.length) {
      if(!nextAccount(leased)){
        const failed={...leased,status:"failed" as const,lease:undefined,error:"Some accounts need attention. Retry failed accounts to finish; completed accounts are saved.",updatedAt:new Date().toISOString()};
        await write(jobPath,failed,leaseVersion);return {job:publicJob(failed)};
      }
      const next = {
        ...leased,
        lease: undefined,
        updatedAt: new Date().toISOString(),
      };
      await write(jobPath, next, leaseVersion);
      return { job: publicJob(next) };
    }
    const entries: Entry[] = [];
    stage='saving';
    for (const item of leased.completed) {
      const file = await read<Entry>(item.path);
      if (!file.value) throw Error("An account result is missing");
      entries.push(file.value);
    }
    const portfolio = matchPortfolio(job.template, accounts);
    const exclusions = [
      ...portfolio.missing,
      ...Array.from(portfolio.matches)
        .filter(([accountId]) => !job.accountIds.includes(accountId))
        .map(([, client]) => ({
          name: client.name,
          reason: "Outside the selected accounts for this report.",
        })),
    ];
    const selectedSkill = skillVersion(job.skill);
    const html = renderDailyDocument(entries, job.date, {
      layouts: Object.fromEntries(portfolio.matches),
      exclusions,
      template: job.template,
      skill: selectedSkill,
    });
    const saved: SavedDaily = {
      date: job.date,
      savedAt: new Date().toISOString(),
      accountIds: job.accountIds,
      template: job.template,
      portfolioId:job.portfolioId,
      html,
      skill: selectedSkill,
      runs: leased.completed.map((e) => e.run),
      jobId: job.id,
    };
    const version = await write(savedPath, saved, job.baseVersion);
    const complete = {
      ...leased,
      status: "complete" as const,
      lease: undefined,
      updatedAt: saved.savedAt,
    };
    await write(jobPath, complete, leaseVersion).catch(() =>
      console.error("Daily completion marker unavailable", { job: job.id }),
    );
    return { saved, version, job: publicJob(complete) };
  } catch (error) {
    if(error instanceof DailyReviewProgress){
      const next={...leased,lease:undefined,currentReview:{done:error.done,total:error.total},updatedAt:new Date().toISOString()};
      await write(jobPath,next,leaseVersion);
      return {job:publicJob(next)};
    }
    if (error instanceof DailyConflict) {
      await write(
        jobPath,
        {
          ...leased,
          status: "failed",
          lease: undefined,
          error:
            "Another report changed during this update. Discard it and start a new update.",
        },
        leaseVersion,
      ).catch(() => {});
      throw error;
    }
    const failure=describeDailyFailure(stage,error);
    console.error("Daily skill batch failed", {
      name: error instanceof Error ? error.name : "Unknown",
      account: failedAccount,
      reason: error instanceof Error ? error.message.slice(0, 400) : "Unknown",
      stage:failure.stage,code:failure.code,reference:failure.reference,
    });
    const blocked=[...(leased.blocked||[]),...(failedId?[{id:failedId,name:failedAccount,failure,error:failure.message}]:[])];
    const more=!!failedId&&!!nextAccount({...leased,blocked});
    const failed = {
      ...leased,blocked,
      status: more ? "running" as const : "failed" as const,
      lease: undefined,
      failure,
      error:
        (failedAccount ? failedAccount + ": " : "") +
        failure.message+' Your last saved report is unchanged.',
      updatedAt: new Date().toISOString(),
    };
    await write(jobPath, failed, leaseVersion);
    return { job: publicJob(failed) };
  }
}
