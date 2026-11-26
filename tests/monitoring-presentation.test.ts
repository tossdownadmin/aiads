import {expect,it} from 'vitest';
import {evaluateMonitor} from '../lib/monitoring/engine';
import {accountFact,evidenceCsv,evidenceValue,issueState,spendGroups,staleSnapshot} from '../lib/monitoring/presentation';
import type {IssueNote,PortfolioEntry} from '../lib/monitoring/types';
import {input,now} from './fixtures/monitoring';
function entry():PortfolioEntry {const data=input(),snapshot=evaluateMonitor(data);return {id:data.account.id,name:data.account.name,account:data.account,snapshot,notes:{}};}
it('keeps currency/date groups separate and excludes stale or unreconciled sources',()=>{
 const a=entry(),b=entry(),c=entry(),d=entry();b.id='act_456';b.snapshot!.account={...b.snapshot!.account,currency:'USD'};c.id='act_789';c.snapshot!.window={since:'2026-11-21',until:'2026-11-27'};d.snapshot!.integrity='mismatch';const groups=spendGroups([a,b,c,d],now);expect(groups).toHaveLength(2);expect(groups.map(g=>g.currency).sort()).toEqual(['CAD','USD']);expect(groups.every(g=>g.total==='100')).toBe(true);
});
it('labels old snapshots and respects snooze expiry without altering source checks',()=>{
 const row=entry();expect(staleSnapshot(row.snapshot!,now)).toBe(false);expect(staleSnapshot(row.snapshot!,new Date('2026-11-29T15:00:00Z'))).toBe(true);
 const note={state:'snoozed',snoozedUntil:'2026-11-27T14:00:00Z'} as IssueNote;expect(issueState(note,now)).toBe('open');expect(issueState({...note,snoozedUntil:'2026-11-28T14:00:00Z'},now)).toBe('snoozed');
});
it('exports exact values and source metadata while neutralizing spreadsheet formulas',()=>{
 const row=entry();row.snapshot!.evidence[0].entityName='=IMPORTXML("private")';const csv=evidenceCsv(row.snapshot!);expect(csv).toContain("'=IMPORTXML");expect(csv).toContain('Source field');expect(csv).toContain('Skill hash');expect(evidenceValue(accountFact(row.snapshot!,'costPerResult'))).toBe('CAD 5.00');
});
