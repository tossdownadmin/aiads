import {createHash,randomUUID} from 'node:crypto';
import {BlobNotFoundError,BlobPreconditionFailedError,get,list,put} from '@vercel/blob';
import type {IssueNote,MonitorSnapshot,Period,Versioned} from './types';

export class MonitorConflict extends Error {}
function accountPath(account:string,period:Period) {
  if(!/^act_\d+$/.test(account)||!['7d','30d'].includes(period))throw Error('Invalid monitoring account or period.');
  return account+'/'+period;
}
function runPath(account:string,period:Period,id:string) {
  if(!/^\d{13}-[a-f\d-]{36}$/.test(id))throw Error('Invalid monitoring run.');
  return 'monitoring/runs/'+accountPath(account,period)+'/'+id+'.json';
}
export async function readPrivate<T>(path:string):Promise<Versioned<T>> {
  let file;try{file=await get(path,{access:'private',useCache:false});}catch(e){if(e instanceof BlobNotFoundError)return {value:null,version:null};throw e;}
  if(!file)return {value:null,version:null};
  if(!file.stream||!file.blob.etag)throw Error('Monitoring storage returned incomplete data.');
  return {value:await new Response(file.stream).json() as T,version:file.blob.etag};
}
export async function writePrivate(path:string,value:unknown,version:string|null=null) {
  try { const blob=await put(path,JSON.stringify(value),{access:'private',addRandomSuffix:false,allowOverwrite:version!==null,contentType:'application/json',...(version?{ifMatch:version}:{})});return blob.etag; }
  catch(e){if(e instanceof BlobPreconditionFailedError||(e instanceof Error&&/already exists/i.test(e.message)))throw new MonitorConflict('Another teammate or refresh changed this record. Reload before saving.');throw e;}
}
export async function claimRefresh(account:string,period:Period,now=Date.now()) {
  const path='monitoring/locks/'+accountPath(account,period)+'.json',lock=await readPrivate<{expiresAt:number}>(path);
  if(lock.value&&lock.value.expiresAt>now)throw new MonitorConflict('This account is already refreshing. Its result will remain saved; retry shortly.');
  const version=await writePrivate(path,{expiresAt:now+120000,claimId:randomUUID()},lock.version);
  return async()=>{await writePrivate(path,{expiresAt:0},version);};
}
export const newMonitorId=()=>String(9999999999999-Date.now()).padStart(13,'0')+'-'+randomUUID();
function validateSnapshot(value:MonitorSnapshot|null,account:string,period:Period,id?:string) {
  if(value&&(value.schema!=='meta-monitor-v1'||value.account.id!==account||value.period!==period||(id&&value.id!==id)||!Array.isArray(value.evidence)||!Array.isArray(value.checks)||!Array.isArray(value.findings)))throw Error('Saved monitoring evidence failed its identity check.');
  return value;
}
export async function readMonitorRun(account:string,period:Period,id:string) {
  const value=(await readPrivate<MonitorSnapshot>(runPath(account,period,id))).value;
  return validateSnapshot(value,account,period,id);
}
export async function latestMonitor(account:string,period:Period) {
  const pointer=await readPrivate<{id:string}>('monitoring/latest/'+accountPath(account,period)+'.json');
  return pointer.value?readMonitorRun(account,period,pointer.value.id):null;
}
export async function saveMonitor(snapshot:MonitorSnapshot) {
  const path='monitoring/latest/'+accountPath(snapshot.account.id,snapshot.period)+'.json',pointer=await readPrivate<{id:string;startedAt:string}>(path);
  await writePrivate(runPath(snapshot.account.id,snapshot.period,snapshot.id),snapshot);
  if(pointer.value&&pointer.value.startedAt>snapshot.startedAt)return;
  await writePrivate(path,{id:snapshot.id,startedAt:snapshot.startedAt,completedAt:snapshot.completedAt},pointer.version);
}
export async function monitorHistory(account:string,period:Period) {
  const prefix='monitoring/runs/'+accountPath(account,period)+'/',page=await list({prefix,limit:12});
  return Promise.all(page.blobs.map(async blob=>{
    const id=blob.pathname.slice(prefix.length,-5),snapshot=await readMonitorRun(account,period,id);
    return snapshot?{id,completedAt:snapshot.completedAt,window:snapshot.window,score:snapshot.score,integrity:snapshot.integrity,findings:snapshot.findings.length}:null;
  }));
}
const notePath=(account:string,period:Period,issueId:string)=>'monitoring/issues/'+accountPath(account,period)+'/'+createHash('sha256').update(issueId).digest('hex')+'.json';
export async function readIssue(account:string,period:Period,issueId:string) {return readPrivate<IssueNote>(notePath(account,period,issueId));}
export async function saveIssue(account:string,period:Period,note:IssueNote,version:string|null) {
  if(note.accountId!==account)throw Error('Issue account mismatch.');
  const path=notePath(account,period,note.issueId),existing=await readPrivate<IssueNote&{history?:IssueNote[]}>(path);
  if(existing.version!==version)throw new MonitorConflict('This issue was updated by someone else. Reload its latest state.');
  const {history:oldHistory,...previous}=existing.value||{},history=existing.value?[...(oldHistory||[]),previous as IssueNote].slice(-100):[];
  const newVersion=await writePrivate(path,{...note,history},version);return {value:note,version:newVersion};
}
