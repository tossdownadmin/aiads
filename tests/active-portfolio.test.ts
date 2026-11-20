import { expect, it } from 'vitest';
import { activeClients, activePortfolio, activeReportTemplate } from '../config/active-clients';

it('includes exactly the assigned brands, matched by verified Meta IDs',()=>{
  expect(activeClients).toHaveLength(15);
  expect(new Set(activeClients.map(client=>client.accountId)).size).toBe(15);
  const names=activeClients.map(client=>client.name);
  for(const excluded of ['Big Apple','kulfiwala','Hemani','Regal Food','Majestic'])expect(names).not.toContain(excluded);
  const accounts=activeClients.map(client=>({id:client.accountId,name:'An updated Meta name',currency:'CAD',status:1}));
  accounts.push({id:'act_587490045801812' as typeof accounts[number]['id'],name:'td Big Apple',currency:'CAD',status:1});
  expect(activePortfolio(accounts).accountIds).toEqual(activeClients.map(client=>client.accountId));
  const renamed=[{id:'act_999',name:'Victoria Harbor Cafe',currency:'USD',status:1}];
  expect(activePortfolio(renamed).accountIds).toEqual([]);
  expect(activePortfolio(renamed).missing).toHaveLength(15);
});

it('preserves existing metric definitions while replacing the old portfolio membership',()=>{
  const periods=[{cards:['Spend'],kpis:['Total Spend'],columns:'SALES' as const}];
  const template=activeReportTemplate({clients:[{name:'Old name',accountId:activeClients[0].accountId,periods},{name:'Big Apple',accountId:'act_587490045801812'}]});
  expect(template.clients).toHaveLength(15);
  expect(template.clients[0]).toMatchObject({name:'Victoria Harbor Cafe',periods});
  expect(template.clients.some(client=>client.name==='Big Apple')).toBe(false);
});
