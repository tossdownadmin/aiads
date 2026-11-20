import { z } from "zod";
import { runReportSkill } from "../skills/report-runner";
import type { ReportingSkill } from "../skills/report-packages";
import type { DailyAnalysis, ReportFinding } from "../skills/report-types";
import type { Report, Metrics } from "./model";
import {
  cash,
  count,
  percent,
  ratio,
  resultKind,
  resultLabel,
  costPer,
} from "./daily-metrics";

type EvidenceFact = {
  id: string;
  periodId: string;
  display: string;
  value: unknown;
};
const labels: Partial<Record<keyof Metrics, string>> = {
  spend: "Spend",
  impressions: "Impressions",
  reach: "Reach",
  frequency: "Frequency",
  clicks: "Clicks",
  ctr: "CTR",
  cpc: "CPC",
  purchases: "Purchases",
  leads: "Leads",
  purchaseValue: "Attributed purchase value",
  roas: "Purchase ROAS",
  instagramVisits: "Instagram profile visits",
  facebookVisits: "Facebook profile visits",
  conversations: "Conversations",
  landingViews: "Landing page views",
  linkClicks: "Link clicks",
  thruplays: "ThruPlays",
  formLeads: "Instant-form leads",
  conversionLeads: "Converted leads",
  websiteLeads: "Website leads",
  onMetaLeads: "On-Meta leads",
};
export function dailyEvidence(report: Report) {
  const facts: EvidenceFact[] = [];
  const add = (
    periodId: string,
    id: string,
    label: string,
    value: unknown,
    display: string,
  ) =>
    facts.push({
      id: periodId + ":" + id,
      periodId,
      value,
      display: label + ": " + display,
    });
  const periods = report.periods.map((p, i) => {
    const id = "window" + i;
    add(
      id,
      "account-status",
      "Account status at retrieval",
      report.account.status,
      String(report.account.status),
    );
    add(
      id,
      "coverage",
      "Data availability",
      p.notes,
      p.notes.length
        ? p.notes.join(" · ")
        : "Account and campaign reporting were retrieved for these dates.",
    );
    const metricFacts = (
      prefix: string,
      name: string,
      metrics: Metrics | null,
    ) => {
      for (const [key, label] of Object.entries(labels) as [
        keyof Metrics,
        string,
      ][]) {
        const v = metrics?.[key] ?? null;
        const text =
          v === null
            ? "Not reported"
            : ["spend", "cpc", "purchaseValue"].includes(key)
              ? report.account.currency + " " + cash(v, report.account.currency)
              : key === "ctr"
                ? percent(v)
                : key === "roas"
                  ? ratio(v)
                  : count(v);
        add(id, prefix + ":" + key, name + " — " + label, v, text);
      }
    };
    metricFacts("account", "Account", p.totals);
    for (const c of p.campaigns) {
      const prefix = "campaign:" + c.id;
      metricFacts(prefix, c.name, c);
      add(
        id,
        prefix + ":delivery",
        c.name + " — status and objective",
        {
          status: c.status,
          objective: c.objective,
          settings: c.settings,
          hasInsights: c.hasInsights,
          start: c.start,
          stop: c.stop,
        },
        [
          c.objective,
          c.status,
          c.hasInsights ? "Reporting row returned" : "No reporting row",
        ].join(" · "),
      );
      const kind = resultKind(c);
      if (kind)
        add(
          id,
          prefix + ":cost-per-result",
          c.name + " — cost per " + resultLabel(kind),
          costPer(c.spend, c[kind]),
          cash(costPer(c.spend, c[kind]), report.account.currency),
        );
    }
    const ads = Object.values(p.details || {})
      .flatMap((d) => d.sets.flatMap((s) => s.ads))
      .sort((a, b) => (b.stats?.spend ?? 0) - (a.stats?.spend ?? 0));
    for (const ad of ads.slice(0, 8))
      add(
        id,
        "ad:" + ad.id,
        ad.name + " — dated ad evidence",
        {
          id: ad.id,
          stats: ad.stats,
          days: ad.days,
          creativeId: ad.creative.id,
          copy: ad.creative.copy.slice(0, 2).map((text) => text.slice(0, 500)),
        },
        "Individual ad metrics and " +
          (ad.days?.length ?? 0) +
          " daily observations supplied.",
      );
    return {
      id,
      window: p.window,
      campaigns: p.campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        objective: c.objective,
        settings: c.settings,
      })),
      inventory: p.inventory,
      adCoverage: {
        available: ads.length,
        supplied: Math.min(ads.length, 8),
        selection: "Highest spend ads. All campaign metrics are supplied.",
      },
    };
  });
  return {
    account: report.account,
    retrievedAt: report.generated,
    periods,
    facts,
    instructions:
      "Review each window independently. Return one to four prioritized findings per window. COPY exact evidence IDs from facts, including the window prefix and metric suffix; never invent a metric ID. Use evidence IDs for metrics rather than restating numbers. Do not treat seven and thirty overlapping days as independent comparison periods.",
  };
}
const text = (max: number) => z.string().trim().min(1).max(max);
const schema = z.object({
  periods: z
    .array(
      z.object({
        periodId: text(40),
        findings: z
          .array(
            z.object({
              tone: z.enum(["crit", "warn", "ok"]),
              title: text(160),
              interpretation: text(500),
              evidenceIds: z.array(text(200)).min(1).max(5),
              action: text(240),
              reason: text(400),
            }),
          )
          .min(1)
          .max(6),
      }),
    )
    .min(1)
    .max(2),
});
export function validateDailyAnalysis(
  raw: unknown,
  evidence: ReturnType<typeof dailyEvidence>,
) {
  const parsed = schema.parse(raw),
    expected = new Set(evidence.periods.map((p) => p.id)),
    seen = new Set<string>();
  if (parsed.periods.length !== expected.size)
    throw Error("The skill did not analyze every reporting window.");
  const facts = new Map(evidence.facts.map((f) => [f.id, f]));
  return parsed.periods.map((p) => {
    if (!expected.has(p.periodId) || seen.has(p.periodId))
      throw Error(
        "The skill returned an unknown or repeated reporting window.",
      );
    seen.add(p.periodId);
    const findings: ReportFinding[] = p.findings
      .map((f) => {
        const cited = f.evidenceIds.map((id) => facts.get(id));
        if (cited.some((fact) => !fact || fact.periodId !== p.periodId)) {
          const invalid = f.evidenceIds.filter(
            (id) => !facts.get(id) || facts.get(id)!.periodId !== p.periodId,
          );
          const allowed = evidence.facts
            .filter((fact) => fact.periodId === p.periodId)
            .slice(0, 5)
            .map((fact) => fact.id);
          throw Error(
            "Evidence outside or unknown for " +
              p.periodId +
              ": " +
              invalid.slice(0, 3).join(", ") +
              ". Copy exact IDs from this window, including the metric suffix. Examples: " +
              allowed.join(", "),
          );
        }
        return {
          tone: f.tone,
          title: f.title,
          detail:
            cited.map((fact) => fact!.display).join(". ") +
            ". " +
            f.interpretation,
          action: f.action,
          reason: f.reason,
        };
      })
      .sort(
        (a, b) =>
          ({ crit: 0, warn: 1, ok: 2 })[a.tone] -
          { crit: 0, warn: 1, ok: 2 }[b.tone],
      );
    return { periodId: p.periodId, findings };
  });
}
export async function analyzeDailyReport(
  report: Report,
  skill: ReportingSkill,
): Promise<DailyAnalysis> {
  const evidence = dailyEvidence(report);
  const modelEvidence = {
    ...evidence,
    facts: evidence.facts.map(({ display, ...fact }) => fact),
  };
  const result = await runReportSkill(skill, modelEvidence, (raw) =>
    validateDailyAnalysis(raw, evidence),
  );
  return { run: result.run, periods: result.output };
}
