import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({get:vi.fn(),put:vi.fn(),list:vi.fn()}));
vi.mock('@vercel/blob',()=>({get:mocks.get,put:mocks.put,list:mocks.list,BlobNotFoundError:class extends Error{},BlobPreconditionFailedError:class extends Error{}}));
import {claimAccount,readDraft,saveDraft} from '../lib/meta/management/store';
import type {Draft} from '../lib/meta/management/types';
const id='1234567890123-11111111-1111-1111-1111-111111111111';
beforeEach(()=>{vi.resetAllMocks();mocks.get.mockResolvedValue(null);mocks.put.mockResolvedValue({etag:'next'});});
it('stores reviews privately and uses the body’s ETag for a conditional claim',async()=>{
  const draft={id,accountId:'act_123',state:'review'} as Draft;await saveDraft(draft);expect(mocks.put.mock.calls[0][2]).toMatchObject({access:'private',allowOverwrite:false,addRandomSuffix:false});
  mocks.get.mockResolvedValueOnce({blob:{etag:'actual-body-version'},stream:new Response(JSON.stringify(draft)).body});const record=await readDraft('act_123',id);expect(record!.version).toBe('actual-body-version');await saveDraft({...draft,state:'executing'},record!.version);expect(mocks.put.mock.calls[1][2]).toMatchObject({ifMatch:'actual-body-version',allowOverwrite:true,access:'private'});
});
it('rejects an active account lease and does not overwrite it',async()=>{
  mocks.get.mockResolvedValueOnce({blob:{etag:'held'},stream:new Response(JSON.stringify({draftId:'other',expiresAt:Date.now()+60000})).body});await expect(claimAccount('act_123',id)).rejects.toThrow('Another change');expect(mocks.put).not.toHaveBeenCalled();
});
it('acquires expired leases with compare-and-swap and releases only its version',async()=>{
  mocks.get.mockResolvedValueOnce({blob:{etag:'expired-version'},stream:new Response(JSON.stringify({expiresAt:0})).body});const release=await claimAccount('act_123',id);expect(mocks.put.mock.calls[0][2]).toMatchObject({ifMatch:'expired-version',access:'private'});await release();expect(mocks.put.mock.calls[1][2]).toMatchObject({ifMatch:'next',access:'private'});
});
it('treats races when claiming a review or lease as conflicts rather than retries',async()=>{
  const {BlobPreconditionFailedError}=await import('@vercel/blob');mocks.put.mockRejectedValue(new BlobPreconditionFailedError());await expect(saveDraft({id,accountId:'act_123'} as Draft,'stale')).rejects.toThrow('already been applied');await expect(claimAccount('act_123',id)).rejects.toThrow('Another change');expect(mocks.put).toHaveBeenCalledTimes(2);
});
