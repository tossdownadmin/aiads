'use client';
import {useEffect,useRef,useState} from 'react';
import type {MetaAccount} from '../lib/meta/read';
import type {DailyClientContext,DailyClientContextInput} from '../lib/reports/client-context';

type ContextDraft = Record<ProfileField,string> & { businessGoal: string; qualificationNotes: string; targetCpa: string; targetCpl: string; targetRoas: string; monthlyBudget: string; budgetMonth: string };
type ProfileField='primaryOutcome'|'conversionDefinition'|'markets'|'approvedOffers'|'creativeRestrictions'|'targetOwner'|'approvedOn'|'validUntil'|'targetCostPerResult';
const contextDraft = (context: DailyClientContext | null): ContextDraft => ({
  businessGoal: context?.businessGoal ?? '',
  ...Object.fromEntries(['primaryOutcome','conversionDefinition','markets','approvedOffers','creativeRestrictions','targetOwner','approvedOn','validUntil','targetCostPerResult'].map(key=>[key,String(context?.[key as keyof DailyClientContext]??'')])),
  qualificationNotes: context?.qualificationNotes ?? '',
  targetCpa: context?.targetCpa?.toString() ?? '',
  targetCpl: context?.targetCpl?.toString() ?? '',
  targetRoas: context?.targetRoas?.toString() ?? '',
  monthlyBudget: context?.monthlyBudget?.toString() ?? '',
  budgetMonth: context?.budgetMonth ?? '',
} as ContextDraft);

export default function DailyContextEditor({ account,onSaved }: { account: MetaAccount;onSaved?:()=>void }) {
  const [draft,setDraft] = useState<ContextDraft>(()=>contextDraft(null));
  const [record,setRecord] = useState<{ context: DailyClientContext | null; version: string | null; currency: string } | null>(null);
  const [loading,setLoading] = useState(true), [saving,setSaving] = useState(false);
  const [error,setError] = useState(''), [status,setStatus] = useState('');
  const [conflict,setConflict] = useState(false), [reload,setReload] = useState(0);
  const mounted = useRef(false), savingLock = useRef(false);
  useEffect(()=>{
    mounted.current=true;
    return()=>{mounted.current=false;};
  },[]);
  useEffect(()=>{
    const controller = new AbortController();
    let current = true;
    setLoading(true);setError('');setStatus('');setRecord(null);setConflict(false);
    void (async()=>{
      try {
        const response = await fetch('/api/meta/reports/context?accountId='+encodeURIComponent(account.id), {cache:'no-store',signal:controller.signal});
        const result = await response.json();
        if (!current) return;
        if (!response.ok) throw Error(result.error || 'The saved context could not be loaded.');
        if (result.account?.id !== account.id || (result.context && result.context.accountId !== account.id)) throw Error('The saved context does not match this account. Reload it.');
        setRecord({context:result.context,version:result.version,currency:result.account.currency});
        setDraft(contextDraft(result.context));
      } catch (e) {
        if (current) setError(e instanceof Error ? e.message : 'The saved context could not be loaded.');
      } finally { if (current) setLoading(false); }
    })();
    return()=>{current=false;controller.abort();};
  },[account.id,reload]);
  async function save() {
    if (!record || loading || conflict || savingLock.current) return;
    const context: DailyClientContextInput = {businessGoal:draft.businessGoal,qualificationNotes:draft.qualificationNotes};
    for (const field of ['targetCpa','targetCpl','targetRoas','monthlyBudget','targetCostPerResult'] as const) {
      if (!draft[field].trim()) continue;
      const value = Number(draft[field]);
      if (!Number.isFinite(value) || value <= 0) {setError('Targets and monthly budget must be greater than zero, or left blank.');return;}
      context[field]=value;
    }
    for(const key of ['conversionDefinition','markets','approvedOffers','creativeRestrictions','targetOwner','approvedOn','validUntil'] as const)if(draft[key].trim())context[key]=draft[key].trim();
    if(draft.primaryOutcome)context.primaryOutcome=draft.primaryOutcome as DailyClientContext['primaryOutcome'];
    if (draft.budgetMonth) context.budgetMonth=draft.budgetMonth;
    if (context.monthlyBudget !== undefined && !context.budgetMonth) {setError('Choose a budget month when setting a monthly budget.');return;}
    savingLock.current=true;setSaving(true);setError('');setStatus('');
    try {
      const response = await fetch('/api/meta/reports/context', {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({accountId:account.id,version:record.version,context})});
      const result = await response.json();
      if (!mounted.current) return;
      if (!response.ok) {if(response.status===409)setConflict(true);throw Error(result.error || 'The context could not be saved.');}
      if (result.account?.id !== account.id || result.context?.accountId !== account.id) throw Error('The saved context does not match this account. Reload it.');
      setRecord({context:result.context,version:result.version,currency:result.account.currency});
      setDraft(contextDraft(result.context));
      setStatus('Business profile saved. It applies to new audits, reports and plans.');onSaved?.();
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'The context could not be saved.');
    } finally {savingLock.current=false;if(mounted.current)setSaving(false);}
  }
  function reloadSaved() {
    setRecord(null);setLoading(true);setReload(value=>value+1);
  }
  return <div className="rep-context-editor" aria-busy={loading || saving}>
    {loading && <p role="status">Loading saved context…</p>}
    {error && <p className="rep-context-error" role="alert">{error}</p>}
    {!loading && <button type="button" disabled={saving} onClick={reloadSaved}>Reload saved context</button>}
    {conflict && <p className="rep-context-meta">Your draft is still shown. Reloading replaces it with the team’s latest saved context.</p>}
    {record && <form onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={saving || loading}>
      <legend>Business context for {account.name}</legend>
      <p className="rep-context-meta">Currency: <strong>{record.currency}</strong> · From the connected Meta account{record.context ? ' · Last saved '+new Date(record.context.updatedAt).toLocaleString() : ''}</p>
      {record.context && record.context.currency!==record.currency && <p role="alert">The saved context uses {record.context.currency}. These targets will be ignored until you review and save them in {record.currency}.</p>}
      {!record.context && <p role="status">No context saved for this account. Daily reports can still run without it.</p>}
      <label>Business goal<textarea maxLength={1200} rows={3} value={draft.businessGoal} placeholder="Optional: approved business objective" onChange={e=>setDraft({...draft,businessGoal:e.target.value})}/><small>{draft.businessGoal.length}/1,200 characters</small></label>
      <p className="rep-context-meta">Monitoring compares these targets with blended account spend and the selected primary outcome. Campaigns with different objectives need their own review.</p><div className="rep-inputs">
        <label>Target CPA ({record.currency})<input type="number" min="0" step="any" value={draft.targetCpa} placeholder="Optional" onChange={e=>setDraft({...draft,targetCpa:e.target.value})}/></label>
        <label>Target CPL ({record.currency})<input type="number" min="0" step="any" value={draft.targetCpl} placeholder="Optional" onChange={e=>setDraft({...draft,targetCpl:e.target.value})}/></label>
        <label>Target ROAS<input type="number" min="0" step="any" value={draft.targetRoas} placeholder="Optional" onChange={e=>setDraft({...draft,targetRoas:e.target.value})}/></label>
        <label>Approved monthly budget ({record.currency})<input type="number" min="0" step="any" value={draft.monthlyBudget} placeholder="Optional" onChange={e=>setDraft({...draft,monthlyBudget:e.target.value})}/></label>
        <label>Budget month<input type="month" value={draft.budgetMonth} required={!!draft.monthlyBudget.trim()} onChange={e=>setDraft({...draft,budgetMonth:e.target.value})}/><small>Required with a monthly budget; applies to this month only.</small></label>
      </div>
      <label>Primary measured outcome<select value={draft.primaryOutcome} onChange={e=>setDraft({...draft,primaryOutcome:e.target.value})}><option value="">Choose the business outcome</option>{[['purchases','Purchases'],['leads','Leads'],['instagramVisits','Instagram profile visits'],['facebookVisits','Facebook Page visits'],['conversations','Conversations'],['thruplays','ThruPlays'],['reach','Reach'],['landingViews','Landing page views'],['linkClicks','Link clicks']].map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      {(['conversionDefinition','markets','approvedOffers','creativeRestrictions'] as const).map(key=><label key={key}>{{conversionDefinition:'Outcome definition',markets:'Service markets',approvedOffers:'Approved offers',creativeRestrictions:'Creative restrictions'}[key]}<textarea maxLength={1200} rows={2} value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}
      <div className="rep-inputs"><label>Target cost per primary result ({record.currency})<input type="number" min="0" step="any" value={draft.targetCostPerResult} onChange={e=>setDraft({...draft,targetCostPerResult:e.target.value})}/></label><label>Target owner<input maxLength={200} value={draft.targetOwner} onChange={e=>setDraft({...draft,targetOwner:e.target.value})}/></label><label>Approved on<input type="date" value={draft.approvedOn} onChange={e=>setDraft({...draft,approvedOn:e.target.value})}/></label><label>Valid until<input type="date" value={draft.validUntil} onChange={e=>setDraft({...draft,validUntil:e.target.value})}/></label></div>
      <label>Qualification notes<textarea maxLength={1200} rows={3} value={draft.qualificationNotes} placeholder="Optional: what the team considers a qualified lead or sale" onChange={e=>setDraft({...draft,qualificationNotes:e.target.value})}/><small>Team-reported context, not CRM verification. {draft.qualificationNotes.length}/1,200 characters</small></label>
      <button className="rep-primary" type="submit" disabled={saving || conflict}>{saving ? 'Saving context…' : 'Save context'}</button>
      {status && <p role="status">{status}</p>}
    </fieldset></form>}
  </div>;
}

