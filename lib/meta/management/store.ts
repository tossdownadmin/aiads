import { BlobNotFoundError, BlobPreconditionFailedError, get, list, put } from '@vercel/blob';
import type { Draft } from './types';

export class ChangeConflict extends Error {constructor(message='This review has changed or has already been applied. Reload its change record.'){super(message);}}
const path=(account:string,id:string)=>{
  if(!/^act_\d+$/.test(account)||!/^\d{13}-[a-f\d-]{36}$/.test(id))throw new Error('Invalid change reference.');
  return `management/${account}/${id}.json`;
};
export async function readDraft(account:string,id:string) {
  let file;
  try{file=await get(path(account,id),{access:'private',useCache:false});}catch(error){if(error instanceof BlobNotFoundError)return null;throw error;}
  if(!file?.stream)return null;
  if(!file.blob.etag)throw new Error('Change storage did not return a version.');
  return {draft:await new Response(file.stream).json() as Draft,version:file.blob.etag};
}
export async function saveDraft(draft:Draft,version?:string) {
  try {
    const result=await put(path(draft.accountId,draft.id),JSON.stringify(draft),{access:'private',contentType:'application/json',addRandomSuffix:false,allowOverwrite:!!version,...(version?{ifMatch:version}:{})});
    return result.etag;
  } catch(error){if(error instanceof BlobPreconditionFailedError||(error instanceof Error&&/already exists/i.test(error.message)))throw new ChangeConflict();throw error;}
}
export async function history(account:string) {
  if(!/^act_\d+$/.test(account))throw new Error('Invalid account.');
  const page=await list({prefix:`management/${account}/`,limit:30});
  const records=await Promise.all(page.blobs.map(async b=>readDraft(account,b.pathname.split('/').at(-1)!.replace(/\.json$/,''))));
  return {records:records.filter((r):r is NonNullable<typeof r>=>!!r).map(r=>({id:r.draft.id,title:r.draft.title,state:r.draft.state,createdAt:r.draft.createdAt,owner:r.draft.owner})),hasMore:page.hasMore};
}
/** Serialize this tool's writes per account; external Ads Manager edits still require preflight. */
export async function claimAccount(account:string,draftId:string) {
  if(!/^act_\d+$/.test(account))throw new Error('Invalid account.');
  const key=`management-locks/${account}.json`;let file;
  try{file=await get(key,{access:'private',useCache:false});}catch(error){if(!(error instanceof BlobNotFoundError))throw error;}
  let version:string|undefined;
  if(file?.stream){
    const lock=await new Response(file.stream).json();
    if(Number(lock.expiresAt)>Date.now())throw new ChangeConflict('Another change is being applied to this account. Check change history before trying again.');
    version=file.blob.etag;if(!version)throw new Error('Account lock version unavailable.');
  }
  let result;
  try{result=await put(key,JSON.stringify({draftId,expiresAt:Date.now()+10*60000}),{access:'private',contentType:'application/json',addRandomSuffix:false,allowOverwrite:!!version,...(version?{ifMatch:version}:{})});}
  catch(error){if(error instanceof BlobPreconditionFailedError||(error instanceof Error&&/already exists/i.test(error.message)))throw new ChangeConflict('Another change is being applied to this account. Check change history before trying again.');throw error;}
  return async()=>{await put(key,JSON.stringify({draftId,expiresAt:0}),{access:'private',contentType:'application/json',addRandomSuffix:false,allowOverwrite:true,ifMatch:result.etag});};
}
