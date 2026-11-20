import type { MetaAccount } from '../lib/meta/read';
import type { DailyTemplate } from '../lib/reports/daily-template';

// Assigned Ads Resource rows supplied by the team on 2026-11-20.
// IDs were matched against the connected Meta account selector, not guessed by name.
export const activePortfolioId = 'assigned-2026-11-20';
export const activeClients = [
  { name: 'Victoria Harbor Cafe', accountId: 'act_2036318527081035' },
  { name: 'Mandarin Chinese', accountId: 'act_791947983578213' },
  { name: 'Cola One', accountId: 'act_2296335034440488' },
  { name: 'Baba Bakers', accountId: 'act_962989624284321' },
  { name: 'Al Khan', accountId: 'act_3270426203266571' },
  { name: 'Taza Foods', accountId: 'act_1934878816631277' },
  { name: 'Tezmart', accountId: 'act_474224379697300' },
  { name: 'Neamat Khana', accountId: 'act_1345393279538218' },
  { name: 'Kabob Boys', accountId: 'act_1919236218691896' },
  { name: 'Khan Baba', accountId: 'act_523802410411934' },
  { name: 'My Cravingz', accountId: 'act_274443229842051' },
  { name: 'Pita Land', accountId: 'act_1314840667407076' },
  { name: 'Mrakovic', accountId: 'act_102410530301526' },
  { name: 'Al Kabab', accountId: 'act_780400040884747' },
  { name: 'tossdown', accountId: 'act_391243736087143' },
] as const;

export function activePortfolio(accounts: MetaAccount[]) {
  const available = new Set(accounts.map(account => account.id));
  return {
    id: activePortfolioId,
    accountIds: activeClients.filter(client => available.has(client.accountId)).map(client => client.accountId),
    missing: activeClients.filter(client => !available.has(client.accountId)).map(client => ({
      name: client.name,
      reason: 'The assigned Meta ad account is unavailable to this connection.',
    })),
  };
}

export function activeReportTemplate(previous?: DailyTemplate): DailyTemplate {
  return { clients: activeClients.map(client => ({
    ...previous?.clients.find(layout => layout.accountId === client.accountId),
    name: client.name,
    accountId: client.accountId,
  })) };
}
