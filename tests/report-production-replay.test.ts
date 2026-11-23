import {readFileSync} from 'node:fs';
import {expect,it,vi,afterEach} from 'vitest';
import {dailyEvidence,validateDailyAnalysis,recoverDailyFindings} from '../lib/reports/daily-analysis';
import {cash,count,percent,ratio} from '../lib/reports/daily-metrics';
import {getReportingSkills} from '../lib/skills/report-packages';
import {runReportSkill} from '../lib/skills/report-runner';

const api=vi.hoisted(()=>({model:vi.fn(),put:vi.fn()}));
vi.mock('../lib/ai/bedrock',()=>({invokeReportModel:api.model}));
vi.mock('@vercel/blob',()=>({put:api.put}));
afterEach(()=>vi.unstubAllEnvs());

// Private production records remain outside the repository. The supplied model
// snapshot omits display strings; reconstruct only their canonical formatting.
it.runIf(!!process.env.AIADS_REPLAY_EVIDENCE&&!!process.env.AIADS_REPLAY_OUTPUT)('replays the exact failed responses against the user-supplied cited Meta evidence and saves the verified review',async()=>{
 const input=JSON.parse(readFileSync(process.env.AIADS_REPLAY_EVIDENCE!,'utf8'));
 const failed=JSON.parse(readFileSync(process.env.AIADS_REPLAY_OUTPUT!,'utf8'));
 const responses=failed.attempts.map((a:any)=>a.response);
 const facts=input.facts.map((f:any)=>{
  const key=f.id.split(':').at(-1),periodId=f.id.split(':')[0];
  const formatted=f.value===null?'Not reported':typeof f.value!=='number'?'Supplied structured evidence':key==='spend'||key==='cpc'||key==='purchaseValue'?input.account.currency+' '+cash(f.value,input.account.currency):key.startsWith('cost-per-')?cash(f.value,input.account.currency):key==='ctr'?percent(f.value):key==='roas'?ratio(f.value):count(f.value);
  return {...f,periodId,display:'Supplied evidence — '+f.label+': '+formatted};
 });
 const evidence={...input,facts} as ReturnType<typeof dailyEvidence>;
 const references=new Set(responses.flatMap((r:any)=>r.periods.flatMap((p:any)=>p.findings.flatMap((f:any)=>f.evidenceIds))));
 expect([...references].every(id=>facts.some((f:any)=>f.id===id))).toBe(true);
 // Both full responses still contain unsupported observations. Partial recovery
 // must retain useful findings in every window without changing any source KPI.
 for(const response of responses)expect(()=>validateDailyAnalysis(response,evidence)).toThrow();
 const recovered=recoverDailyFindings(responses,evidence);
 expect(recovered.periods.map(p=>p.findings.length)).toEqual([2,3]);
 expect(recovered.periods[0].findings.some(f=>f.title.includes('Nov 16–22'))).toBe(true);
 expect(JSON.stringify(recovered.periods[0].findings)).toContain('Not reported');
 expect(JSON.stringify(recovered.periods[0].findings)).toContain('110');
 expect(recovered.periods[1].findings.some(f=>f.title==='Profile-visit campaigns delivered strong IG visit volume')).toBe(true);
 expect(JSON.stringify(recovered.periods)).not.toContain('%%');
 expect(JSON.stringify(recovered.periods)).not.toContain('nearly 900');
 expect(recovered.rejected.some(f=>f.title.includes('frequency exceeded'))).toBe(true);
 vi.stubEnv('BEDROCK_MODEL_ID','replay-model');api.put.mockResolvedValue({etag:'replay'});
 api.model.mockResolvedValueOnce(responses[0]).mockResolvedValueOnce(responses[1]);
 const result=await runReportSkill(getReportingSkills()[0],input,raw=>validateDailyAnalysis(raw,evidence),{recover:attempts=>{const validated=recoverDailyFindings(attempts,evidence);return {output:validated.periods,validation:{rejected:validated.rejected}};}});
 expect(result.run.reviewStatus).toBe('limited');expect(result.output).toEqual(recovered.periods);
 expect(api.put).toHaveBeenCalledTimes(3);expect(api.put.mock.calls.every(c=>c[2].access==='private')).toBe(true);
});

it.runIf(!!process.env.AIADS_PITA_EVIDENCE&&!!process.env.AIADS_PITA_OUTPUT)('replays the Pita production batch with exact input and both failed responses',async()=>{
 const input=JSON.parse(readFileSync(process.env.AIADS_PITA_EVIDENCE!,'utf8'));
 const failed=JSON.parse(readFileSync(process.env.AIADS_PITA_OUTPUT!,'utf8'));
 const {createHash}=await import('node:crypto');
 expect(createHash('sha256').update(JSON.stringify(input)).digest('hex')).toBe(failed.evidenceHash);
 const facts=input.facts.map((f:any)=>{
  const key=f.id.split(':').at(-1),periodId=f.id.split(':')[0];
  const formatted=f.value===null?'Not reported':typeof f.value!=='number'?'Supplied structured evidence':key==='spend'||key==='cpc'||key==='purchaseValue'?input.account.currency+' '+cash(f.value,input.account.currency):key.startsWith('cost-per-')?cash(f.value,input.account.currency):key==='ctr'?percent(f.value):key==='roas'?ratio(f.value):count(f.value);
  return {...f,periodId,display:'Supplied evidence — '+f.label+': '+formatted};
 });
 const evidence={...input,facts} as ReturnType<typeof dailyEvidence>;
 const responses=failed.attempts.map((a:any)=>a.response);
 for(const response of responses)expect(()=>validateDailyAnalysis(response,evidence)).toThrow();
 const recovered=recoverDailyFindings(responses,evidence);
 expect(recovered.periods).toHaveLength(1);expect(recovered.periods[0].findings).toHaveLength(2);
 expect(recovered.periods[0].findings.map(f=>f.title)).toEqual([
  'Creative concentration: two ads account for nearly all NB/NS spend and leads',
  'Vancouver Franchise Show awareness campaign completed on schedule',
 ]);
 const text=JSON.stringify(recovered.periods);
 expect(text).toContain('CAD $752.92');expect(text).toContain('CAD $251.80');expect(text).toContain('Nov 11–15');
 expect(text).not.toContain('CAD 39');expect(text).not.toContain('~11%');expect(text).not.toContain('over 100%');
 expect(recovered.rejected).toHaveLength(3);expect(recovered.periods[0].notes?.[0]).toContain('3 proposed observations were omitted');
});
