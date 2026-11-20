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
};
export type DailyAnalysis = {
  run: SkillRun;
  periods: { periodId: string; findings: ReportFinding[] }[];
};
