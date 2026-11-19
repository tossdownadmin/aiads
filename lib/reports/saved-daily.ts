import type { DailyTemplate } from './daily-template';

export type SavedDaily = {
  date: string;
  savedAt: string;
  accountIds: string[];
  template?: DailyTemplate;
  html: string;
};
