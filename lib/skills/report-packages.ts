import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { z } from "zod";
import type { SkillRecord } from "./types";
import type { ReportKind, SkillResource, SkillVersion } from "./report-types";

export const defaultReportSkills = {
  daily: "daily-meta-review",
  monthly: "monthly-meta-plan",
} as const;
const manifest = z.object({
  name: z.string(),
  description: z.string(),
  reportType: z.enum(["daily", "monthly"]),
  contract: z.enum(["daily-v1", "monthly-v1"]),
  requirements: z.array(z.string()).max(12),
  resources: z.array(z.string()).max(10),
});
export type ReportingSkill = SkillRecord & {
  body: string;
  original: string;
  files: string[];
  fetchedAt: string;
  reportType: ReportKind;
  contract: string;
  requirements: string[];
  resources: SkillResource[];
  trustTier: number;
};
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function skillVersion(skill: ReportingSkill): SkillVersion {
  return {
    name: skill.name,
    source: skill.source,
    sha: skill.sha,
    packageHash: hash(
      JSON.stringify({
        body: skill.body,
        resources: skill.resources,
        contract: skill.contract,
        requirements: skill.requirements,
      }),
    ),
    files: skill.files,
  };
}
export function getReportingSkills(): ReportingSkill[] {
  return (["daily", "monthly"] as const).map((kind) => {
    const folder = resolve(
      process.cwd(),
      "skills/reports",
      defaultReportSkills[kind],
    );
    const read = (path: string) => {
      const file = resolve(folder, path);
      if (!file.startsWith(folder + sep))
        throw Error("Skill resource escaped its package");
      return readFileSync(file, "utf8");
    };
    const config = manifest.parse(JSON.parse(read("manifest.json")));
    if (config.reportType !== kind || config.name !== defaultReportSkills[kind])
      throw Error("Invalid reporting skill manifest");
    const body = read("SKILL.md"),
      resources = config.resources.map((path) => ({
        path,
        content: read(path),
      }));
    const sha = hash(JSON.stringify({ config, body, resources }));
    return {
      name: config.name,
      description: config.description,
      source: "tossdown-aiads",
      path: "skills/reports/" + config.name + "/SKILL.md",
      sha,
      license: "Proprietary",
      categories: [kind === "daily" ? "monitoring" : "planning", "reporting"],
      platforms: ["meta"],
      status: "approved",
      risk: "low",
      findings: [],
      writeActions: false,
      adaptationStatus: "native",
      body,
      original: body,
      files: ["manifest.json", "SKILL.md", ...config.resources],
      fetchedAt: "built-in",
      reportType: kind,
      contract: config.contract,
      requirements: config.requirements,
      resources,
      trustTier: 1,
    };
  });
}
const capabilities = {
  daily: ["meta-report-windows", "meta-ad-details"],
  monthly: [
    "meta-report-windows",
    "meta-ad-details",
    "meta-comparison",
    "meta-tracking",
    "foreplay-selected",
  ],
};
export function checkReportSkill(
  value: SkillRecord & { body: string },
  kind: ReportKind,
): ReportingSkill {
  const skill = value as ReportingSkill;
  if (
    skill.status !== "approved" ||
    skill.writeActions ||
    skill.risk === "high" ||
    !skill.platforms.includes("meta") ||
    skill.reportType !== kind ||
    skill.contract !== kind + "-v1"
  )
    throw Error("Choose an approved skill for this report type.");
  if (
    !Array.isArray(skill.requirements) ||
    skill.requirements.some((r) => !capabilities[kind].includes(r))
  )
    throw Error("The selected skill requires an unsupported data source.");
  if (
    !Array.isArray(skill.resources) ||
    skill.resources.some(
      (r) => typeof r.path !== "string" || typeof r.content !== "string",
    )
  )
    throw Error("The selected reporting skill has missing reference content.");
  if (
    skill.body.length +
      skill.resources.reduce((n, r) => n + r.content.length, 0) >
    90000
  )
    throw Error("The selected skill exceeds the reporting context limit.");
  return skill;
}
