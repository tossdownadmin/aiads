import type { DailyTemplate } from './daily-template';

export type SavedDaily = {
  date: string;
  savedAt: string;
  accountIds: string[];
  template?: DailyTemplate;
  html: string;
  skill?: import('../skills/report-types').SkillVersion;
  runs?: import('../skills/report-types').SkillRun[];
  jobId?: string;
};
