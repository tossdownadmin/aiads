export type ReportKind = "daily" | "monthly";
export type SkillResource = { path: string; content: string };
export type SkillVersion = {
  name: string;
  source: string;
  sha: string;
  packageHash: string;
  files: string[];
};
export type SkillRun = {
  id: string;
  skill: SkillVersion;
  model: string;
  applicationCommit?: string;
  completedAt: string;
  evidenceHash: string;
  evidencePath: string;
  outputPath: string;
};
export type ReportFinding = {
  tone: "ok" | "warn" | "crit";
  title: string;
  detail: string;
  action: string;
  reason: string;
  interpretation?: string;
  evidence?: string[];
  evidenceIds?: string[];
  priority?: "now" | "next" | "monitor";
  category?: "win" | "concern" | "observation" | "data_gap";
};
export type DailyAnalysis = {
  run: SkillRun;
  supportingRuns?: SkillRun[];
  periods: { periodId: string; findings: ReportFinding[] }[];
};
