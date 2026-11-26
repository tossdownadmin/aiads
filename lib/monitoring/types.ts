import type { MetaAccount } from '../meta/read';
import type { DailyClientContext } from '../reports/client-context';
import type { Window } from '../reports/model';

export type Period = '7d' | '30d';
export type Row = Record<string, unknown>;
export type Source = { state: 'available' | 'unavailable'; apiVersion?:string; path: string; params: Record<string,string>; retrievedAt: string; data: Row[] | null; reason?: string };
export type SourceKey = 'account'|'nativeScore'|'campaigns'|'adsets'|'ads'|'currentAccount'|'currentCampaigns'|'currentAds'|'previousAccount'|'previousCampaigns'|'previousAds'|'monthAccount';
export type Sources = Record<SourceKey, Source>;
export type Evidence = {
  id: string; label: string; metric: string; value: string | null; unit: 'currency'|'count'|'percent'|'ratio'|'status';
  entityId: string; entityName: string; scope: 'account'|'campaign'|'ad'; currency?: string; window: Window | null;
  source: SourceKey | 'profile'; field: string; retrievedAt:string; formula?: string; inputs?: string[];
};
export type RuleState = 'pass'|'review'|'fail'|'unknown'|'not_applicable';
export type Check = { id: string; label: string; state: RuleState; weight: number; detail: string; evidenceIds: string[] };
export type Finding = {
  id: string; ruleId: string; accountId: string; entityId: string; entityName: string;
  priority: 'critical'|'high'|'medium'; category: 'delivery'|'measurement'|'performance'|'budget'|'creative'|'readiness';
  title: string; explanation: string; nextStep: string; evidenceIds: string[]; href: string;
};
export type CampaignOutcome = {
  id:string; name:string; objective:string|null; goals:string[]; events:string[];
  outcome:string|null; label:string; state:'reported'|'unreported'|'mixed'|'unsupported'|'unavailable';
  detail:string; resultId?:string; costId?:string; previousCostId?:string; spendId:string;
};
export type MonitorSnapshot = {
  schema: 'meta-monitor-v1'; id: string; account: MetaAccount; period: Period; window: Window; previousWindow: Window;
  startedAt: string; completedAt: string; skill: {name: string; version: string; hash: string};
  context: DailyClientContext | null; contextError: boolean; sources: Sources; evidence: Evidence[]; checks: Check[]; findings: Finding[];
  score: number | null; coverage: {evaluated: number; applicable: number; percent: number};
  integrity: 'verified'|'mismatch'|'unavailable'; nativeScore: string | null; limitations: string[];
  businessIntent?:'SALES'|'LEADS'; campaignOutcomes?:CampaignOutcome[]; scoreBasis?:'source-and-delivery';
};
export type WorkflowState = 'open'|'in_progress'|'reviewed'|'dismissed'|'snoozed';
export type IssueNote = { issueId: string; accountId: string; state: WorkflowState; owner: string; note: string; snoozedUntil?: string; updatedAt: string; updatedBy: string };
export type Versioned<T> = { value: T | null; version: string | null };
export type MonitorSummary = Omit<MonitorSnapshot,'sources'>;
export type PortfolioEntry = { id: string; name: string; account: MetaAccount | null; snapshot: MonitorSummary | null; notes: Record<string, Versioned<IssueNote>>; error?: string };
