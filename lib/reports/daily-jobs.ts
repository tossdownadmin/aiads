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
import { readReportWindows } from "./read";
import { analyzeDailyReport } from "./daily-analysis";
import { selectReportSkill } from "../skills/report-runner";
import { skillVersion, type ReportingSkill } from "../skills/report-packages";
import type { SkillRun } from "../skills/report-types";
import type { SavedDaily } from "./saved-daily";

const savedPath = "reports/daily/latest-v1.json",
  jobPath = "reports/daily/pending-v1.json";
export class DailyConflict extends Error {}
export class DailyInputError extends Error {}
type Entry = { account: MetaAccount; report: Report; run: SkillRun };
type DailyJob = {
  id: string;
  status: "running" | "failed" | "complete" | "cancelled";
  createdAt: string;
  updatedAt: string;
  date: string;
  accountIds: string[];
  template?: DailyTemplate;
  baseVersion: string | null;
  skill: ReportingSkill;
  completed: { id: string; name: string; path: string; run: SkillRun }[];
  lease?: { token: string; until: number };
  error?: string;
};
export type PublicDailyJob = {
  id: string;
  status: DailyJob["status"];
  date: string;
  done: number;
  total: number;
  nextAccount?: string;
  skill: ReturnType<typeof skillVersion>;
  leaseUntil?: number;
  error?: string;
};
const publicJob = (job: DailyJob): PublicDailyJob => ({
  id: job.id,
  status: job.status,
  date: job.date,
  done: job.completed.length,
  total: job.accountIds.length,
  nextAccount: job.accountIds[job.completed.length],
  skill: skillVersion(job.skill),
  leaseUntil: job.lease?.until,
  error: job.error,
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
  const ids = [
    ...new Set(input.accountIds ?? previous.value?.accountIds ?? []),
  ];
  if (!ids.length) throw new DailyInputError("Choose accounts for the report.");
  const accounts = await getAdAccounts(),
    byId = new Map(accounts.map((a) => [a.id, a]));
  if (ids.some((id) => !byId.has(id)))
    throw new DailyInputError(
      "A selected account is unavailable to the Meta connection.",
    );
  const template = input.accountIds
    ? readStoredTemplate(JSON.stringify(input.template) ?? null)
    : previous.value?.template;
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
  };
  await write(jobPath, job, current.version);
  return { job: publicJob(job) };
}
export async function advanceDaily(id: string) {
  const current = await read<DailyJob>(jobPath),
    job = current.value;
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
  const lease = { token: randomUUID(), until: Date.now() + 330000 };
  const leased = {
    ...job,
    status: "running" as const,
    lease,
    error: undefined,
    updatedAt: new Date().toISOString(),
  };
  const leaseVersion = await write(jobPath, leased, current.version);
  let failedAccount = "";
  try {
    const accounts = await getAdAccounts(),
      byId = new Map(accounts.map((a) => [a.id, a]));
    if (job.accountIds.some((accountId) => !byId.has(accountId)))
      throw Error("Account access changed");
    const nextId = job.accountIds[job.completed.length];
    if (nextId) {
      const account = byId.get(nextId)!;
      failedAccount = account.name;
      const path = "reports/daily/jobs/" + job.id + "/" + nextId + ".json";
      let entry = (await read<Entry>(path)).value;
      if (!entry) {
        const generated = new Date().toISOString(),
          periods = await readReportWindows(
            account,
            dailyWindows(job.date, shiftDay(job.date, 1)),
          );
        if (
          periods.some((p) =>
            p.notes.includes(
              "Account totals were unavailable. Campaign rows remain available.",
            ),
          )
        )
          throw Error("Account totals unavailable");
        const report: Report = { account, generated, periods };
        const analysis = await analyzeDailyReport(report, job.skill);
        report.periods = report.periods.map((p, i) => ({
          ...p,
          analysis: {
            findings: analysis.periods.find((a) => a.periodId === "window" + i)!
              .findings,
          },
        }));
        entry = { account, report, run: analysis.run };
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
    }
    if (leased.completed.length < job.accountIds.length) {
      const next = {
        ...leased,
        lease: undefined,
        updatedAt: new Date().toISOString(),
      };
      await write(jobPath, next, leaseVersion);
      return { job: publicJob(next) };
    }
    const entries: Entry[] = [];
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
    console.error("Daily skill batch failed", {
      name: error instanceof Error ? error.name : "Unknown",
      account: failedAccount,
      reason: error instanceof Error ? error.message.slice(0, 400) : "Unknown",
    });
    const failed = {
      ...leased,
      status: "failed" as const,
      lease: undefined,
      error:
        (failedAccount ? failedAccount + ": " : "") +
        "The evidence or skill analysis could not complete. Your last saved report is unchanged. Resume to retry.",
      updatedAt: new Date().toISOString(),
    };
    await write(jobPath, failed, leaseVersion);
    return { job: publicJob(failed) };
  }
}
