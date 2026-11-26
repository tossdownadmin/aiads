import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({get:vi.fn(),put:vi.fn(),list:vi.fn()}));
vi.mock('@vercel/blob',()=>({BlobNotFoundError:class extends Error{},BlobPreconditionFailedError:class extends Error{},get:mocks.get,put:mocks.put,list:mocks.list}));
import {claimRefresh,saveIssue,saveMonitor} from '../lib/monitoring/store';
import {evaluateMonitor} from '../lib/monitoring/engine';
import {input} from './fixtures/monitoring';
beforeEach(()=>{vi.resetAllMocks();mocks.get.mockResolvedValue(null);mocks.put.mockResolvedValue({etag:'next-version'});});
const file=(value:unknown,etag='current-version')=>({stream:new Response(JSON.stringify(value)).body,blob:{etag}});
it('writes immutable source runs and uses conditional latest-pointer replacement',async()=>{
 const snapshot=evaluateMonitor(input());mocks.get.mockResolvedValueOnce(file({id:'prior',startedAt:'2026-11-26T00:00:00Z'}));await saveMonitor(snapshot);
 expect(mocks.put.mock.calls[0][2]).toMatchObject({access:'private',allowOverwrite:false,addRandomSuffix:false});expect(mocks.put.mock.calls[1][2]).toMatchObject({ifMatch:'current-version',allowOverwrite:true});
});
it('refuses concurrent refreshes and uses the expired lock version when replacing a claim',async()=>{
 mocks.get.mockResolvedValueOnce(file({expiresAt:1001}));await expect(claimRefresh('act_123','7d',1000)).rejects.toThrow('already refreshing');expect(mocks.put).not.toHaveBeenCalled();
 mocks.get.mockResolvedValueOnce(file({expiresAt:999}));await claimRefresh('act_123','7d',1000);expect(mocks.put.mock.calls[0][2].ifMatch).toBe('current-version');
});
it('does not overwrite a teammate review on a stale issue version',async()=>{
 mocks.get.mockResolvedValueOnce(file({state:'in_progress'}));await expect(saveIssue('act_123','7d',{issueId:'rule:act_123:7d',accountId:'act_123',owner:'Owner',note:'Review',state:'reviewed',updatedAt:new Date().toISOString(),updatedBy:'operator@example.com'},null)).rejects.toThrow('someone else');expect(mocks.put).not.toHaveBeenCalled();
});
