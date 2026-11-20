import { z } from "zod";
import { runReportSkill } from "../skills/report-runner";
import type { ReportingSkill } from "../skills/report-packages";
import {hash,skillVersion} from '../skills/report-packages';
import type { DailyAnalysis, ReportFinding, SkillRun } from "../skills/report-types";
import type { Report, Metrics } from "./model";
import {
  cash,
  count,
  percent,
  ratio,
  resultKind,
  resultLabel,
  costPer,
} from "./daily-metrics";

type EvidenceFact = {
  id: string;
  periodId: string;
  display: string;
  value: unknown;
};
const labels: Partial<Record<keyof Metrics, string>> = {
  spend: "Spend",
  impressions: "Impressions",
  reach: "Reach",
  frequency: "Frequency",
  clicks: "Clicks",
  ctr: "CTR",
  cpc: "CPC",
  purchases: "Purchases",
  leads: "Leads",
  purchaseValue: "Attributed purchase value",
  roas: "Purchase ROAS",
  instagramVisits: "Instagram profile visits",
  facebookVisits: "Facebook Page visits",
  conversations: "Conversations",
  landingViews: "Landing page views",
  linkClicks: "Link clicks",
  thruplays: "ThruPlays",
  formLeads: "Instant-form leads",
  conversionLeads: "Converted leads",
  websiteLeads: "Website leads",
  onMetaLeads: "On-Meta leads",
};
export function dailyEvidence(report: Report) {
  const context=report.reviewContext?.accountId===report.account.id&&report.reviewContext.currency===report.account.currency?report.reviewContext:null;
  const facts: EvidenceFact[] = [];
  const add = (
    periodId: string,
    id: string,
    label: string,
    value: unknown,
    display: string,
  ) =>
    facts.push({
      id: periodId + ":" + id,
      periodId,
      value,
      display: label + ": " + display,
    });
  const periods = report.periods.map((p, i) => {
    const id = "window" + i;
    add(
      id,
      "account-status",
      "Account status at retrieval",
      report.account.status,
      String(report.account.status),
    );
    add(
      id,
      "coverage",
      "Data availability",
      [...p.notes,...p.reviewNotes??[]],
      p.notes.length || p.reviewNotes?.length
        ? [...p.notes,...p.reviewNotes??[]].join(" · ")
        : "Account and campaign reporting were retrieved for these dates.",
    );
    const metricFacts = (
      prefix: string,
      name: string,
      metrics: Metrics | null,
    ) => {
      for (const [key, label] of Object.entries(labels) as [
        keyof Metrics,
        string,
      ][]) {
        const v = metrics?.[key] ?? null;
        const text =
          v === null
            ? "Not reported"
            : ["spend", "cpc", "purchaseValue"].includes(key)
              ? report.account.currency + " " + cash(v, report.account.currency)
              : key === "ctr"
                ? percent(v)
                : key === "roas"
                  ? ratio(v)
                  : count(v);
        add(id, prefix + ":" + key, name + " — " + label, v, text);
      }
      for(const [key,label] of [['purchases','purchase'],['leads','lead']] as const){
        const value=costPer(metrics?.spend??null,metrics?.[key]??null);
        add(id,prefix+':cost-per-'+label,name+' — cost per '+label,value,cash(value,report.account.currency));
      }
    };
    metricFacts("account", "Account", p.totals);
    add(id,'client-context','Client-supplied business goals and targets',context??null,context?'Client-supplied context; lead quality and margins are not independently verified.':'No matching client targets or business goal supplied.');
    if(context)for(const [key,label] of [['targetCpa','Approved target CPA'],['targetCpl','Approved target CPL'],['targetRoas','Approved target ROAS']] as const){
      const value=context[key];if(value!==undefined)add(id,'target:'+key,label,value,key==='targetRoas'?ratio(value):report.account.currency+' '+cash(value,report.account.currency));
    }
    if(p.previous){
      add(id,'previous-window','Equal-length previous period',p.previous.window,p.previous.window.since+' to '+p.previous.window.until);
      metricFacts('previous-account','Previous period — account',p.previous.totals);
    }
    if(p.pacing)add(id,'budget-pacing','Approved monthly budget pacing',p.pacing,
      report.account.currency+' '+cash(p.pacing.spent,report.account.currency)+' spent through day '+p.pacing.elapsedDays+' of '+p.pacing.monthDays+'; approved '+p.pacing.month+' budget '+cash(p.pacing.budget,report.account.currency)+'; linear month-end projection '+cash(p.pacing.projectedSpend,report.account.currency)+' (estimate, not a forecast guarantee).');
    for (const c of p.campaigns) {
      const prefix = "campaign:" + c.id;
      metricFacts(prefix, c.name, c);
      add(
        id,
        prefix + ":delivery",
        c.name + " — status and objective",
        {
          status: c.status,
          objective: c.objective,
          settings: c.settings,
          hasInsights: c.hasInsights,
          start: c.start,
          stop: c.stop,
        },
        [
          c.objective,
          c.status,
          c.hasInsights ? "Reporting row returned" : "No reporting row",
        ].join(" · "),
      );
      const kind = resultKind(c);
      if (kind)
        add(
          id,
          prefix + ":cost-per-result",
          c.name + " — cost per " + resultLabel(kind),
          costPer(c.spend, c[kind]),
          cash(costPer(c.spend, c[kind]), report.account.currency),
        );
      const previous=p.previous?.campaigns.find(prior=>prior.id===c.id);
      if(previous){
        metricFacts('previous-campaign:'+c.id,'Previous period — '+c.name,previous);
        const changes:Record<string,number|null>={};
        for(const key of ['spend','ctr','cpc','purchases','leads','roas','instagramVisits','facebookVisits'] as const){
          changes[key]=previous[key]!=null&&previous[key]!>0&&c[key]!=null?100*(c[key]!-previous[key]!)/previous[key]!:null;
        }
        if(kind){
          const current=costPer(c.spend,c[kind]),prior=costPer(previous.spend,previous[kind]);
          add(id,'previous-campaign:'+c.id+':cost-per-result','Previous period — '+c.name+' — cost per '+resultLabel(kind),prior,cash(prior,report.account.currency));
          changes.costPerResult=prior!=null&&prior>0&&current!=null?100*(current-prior)/prior:null;
        }
        add(id,prefix+':change','Comparable previous-period changes for '+c.name,{previousWindow:p.previous!.window,percent:changes},Object.entries(changes).filter(([,v])=>v!==null).map(([key,v])=>key+' '+(v!>=0?'+':'')+v!.toFixed(1)+'%').join(' · ')||'No comparable nonzero baseline.');
      }
    }
    let adCount=0,setCount=0;
    for(const [campaignId,detail] of Object.entries(p.details??{}))for(const set of detail.sets){
      setCount++;
      add(id,'adset:'+set.id,set.name+' — ad set settings and outcomes',{
        id:set.id,name:set.name,campaignId,statusAtRetrieval:set.status,settings:set.settings,stats:set.stats??null,
      },'Current targeting, placement eligibility, budget settings and period metrics. These are not audience/placement performance breakdowns.');
      for(const ad of set.ads){
        adCount++;
        add(id,'ad:'+ad.id,ad.name+' — ad performance',{
          id:ad.id,name:ad.name,campaignId,adsetId:set.id,statusAtRetrieval:ad.status,
          stats:ad.stats??null,days:ad.days??[],creativeId:ad.creative.id,
          copy:ad.creative.copy.slice(0,2).map(text=>text.slice(0,320)),formats:[...new Set(ad.creative.assets.map(a=>a.kind))],
        },(ad.stats?.spend!=null?'Spend '+cash(ad.stats.spend,report.account.currency)+'. ':'')+(ad.days?.length??0)+' dated daily observations; '+(ad.creative.assets.length?'creative metadata and copy supplied; image/video not visually analysed.':'creative unavailable.'));
      }
    }
    return {
      id,
      window: p.window,
      confirmedZeroDelivery:
        p.totals?.spend === 0 && p.totals?.impressions === 0,
      campaigns: p.campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        objective: c.objective,
        settings: c.settings,
      })),
      inventory: p.inventory,
      adCoverage: {
        available: adCount,
        supplied: adCount,
        adSets:setCount,
        selection: "All returned ad and ad-set metrics and daily observations. Larger evidence is reviewed in separate batches before synthesis. No image/video visual inspection or per-placement performance breakdown is supplied.",
      },
    };
  });
  return {
    account: report.account,
    retrievedAt: report.generated,
    periods,
    facts,
    instructions:
      "Review each window against its supplied previous-window only. Return three to five concise prioritized findings per window when material evidence supports them; fewer is valid. Cover measured wins as well as meaningful concerns without manufacturing either. Use priority now, next or monitor. COPY exact evidence IDs from facts; never invent a metric ID. Cite at most five IDs per finding. Respect each fact label: cost per ThruPlay is not cost per reach, lead or purchase. Include supplied measurements only when their metric, value and unit are explicit; do not calculate new KPI values. Do not bind a whole ad/ad-set object as a scalar number. Describe unverified daily comparisons qualitatively or omit them. Do not treat seven and thirty overlapping days as independent comparison periods. Ad-set settings are current configuration, not performance breakdowns. Missing outcomes are import gaps, not proven tracking failures. Never call leads qualified without independently verified qualification evidence.",
  };
}
const text = (max: number) => z.string().trim().min(1).max(max);
const schema = z.object({
  periods: z
    .array(
      z.object({
        periodId: text(40),
        findings: z
          .array(
            z.object({
              tone: z.enum(["crit", "warn", "ok"]),
              title: text(160),
              interpretation: text(500),
              evidenceIds: z.array(text(200)).min(1).max(5),
              action: text(240),
              reason: text(400),
              priority: z.enum(['now','next','monitor']).optional(),
              category: z.enum(['win','concern','observation','data_gap']).optional(),
            }),
          )
          .min(1)
          .max(6),
      }),
    )
    .min(1)
    .max(2),
});
function claimsZeroDelivery(text:string) {
  const claim=/\b(?:no ads (?:were |are )?(?:delivering|running)|no ads ran|no delivery occurred|zero spend|zero delivery|no spending occurred)\b/i;
  const uncertainty=/\b(?:cannot|can't|unable to|unknown|uncertain|unclear|whether|not (?:confirmed|established|verified|proven|proof|evidence|equivalent|the same)|does(?: not|n't) (?:prove|mean|confirm|establish|show)|do not (?:prove|interpret|infer|mean))\b/i;
  return text.split(/[.!?;]|\bbut\b|\bhowever\b/i).some(clause=>claim.test(clause)&&!uncertainty.test(clause));
}
export function validateDailyAnalysis(
  raw: unknown,
  evidence: ReturnType<typeof dailyEvidence>,
):DailyAnalysis['periods'] {
  const parsed = schema.parse(raw),
    expected = new Set(evidence.periods.map((p) => p.id)),
    seen = new Set<string>();
  if (parsed.periods.length !== expected.size)
    throw Error("The skill did not analyze every reporting window.");
  const facts = new Map(evidence.facts.map((f) => [f.id, f]));
  return parsed.periods.map((p) => {
    if (!expected.has(p.periodId) || seen.has(p.periodId))
      throw Error(
        "The skill returned an unknown or repeated reporting window.",
      );
    seen.add(p.periodId);
    const findings: ReportFinding[] = p.findings
      .map((f) => {
        const window = evidence.periods.find((item) => item.id === p.periodId)!;
        const cited = f.evidenceIds.map((id) => facts.get(id));
        const campaignSubjects=[...new Set(f.evidenceIds.flatMap(id=>id.match(/^(window\d+:campaign:[^:]+):/)?.[1]||[]))];
        const citedCampaignZeros=campaignSubjects.length>0&&campaignSubjects.every(subject=>facts.get(subject+':spend')?.value===0&&facts.get(subject+':impressions')?.value===0);
        if (
          !window.confirmedZeroDelivery &&
          !citedCampaignZeros &&
          claimsZeroDelivery([f.title,f.interpretation,f.action,f.reason].join('. '))
        )
          throw Error(
            "No explicit zero delivery was supplied for this cited account or campaign. A missing reporting row or current inactive inventory cannot prove historical zero delivery. Cite the exact zero-spend and zero-impression campaign evidence, or describe the missing evidence instead. Rejected wording: "+f.interpretation.slice(0,220),
          );
        if(cited.some(fact=>fact?.value===null)&&(
          /\b(?:not recording|not tracking|tracking (?:failure|broken|missing)|untracked (?:visits|conversions))\b/i.test(f.title)||
          /\b(?:outcome|result|visit|conversion) (?:metric )?is not being captured\b/i.test(f.interpretation)
        ))throw Error('A missing imported metric does not establish a recording or tracking failure. Describe an imported data gap and compare the same dates and attribution settings in Ads Manager.');
        if (cited.some((fact) => !fact || fact.periodId !== p.periodId)) {
          const invalid = f.evidenceIds.filter(
            (id) => !facts.get(id) || facts.get(id)!.periodId !== p.periodId,
          );
          const allowed = evidence.facts
            .filter((fact) => fact.periodId === p.periodId)
            .slice(0, 5)
            .map((fact) => fact.id);
          throw Error(
            "Evidence outside or unknown for " +
              p.periodId +
              ": " +
              invalid.slice(0, 3).join(", ") +
              ". Copy exact IDs from this window, including the metric suffix. Examples: " +
              allowed.join(", "),
          );
        }
        // Scalar provenance alone does not make different result units
        // interchangeable. Preserve the server-selected outcome label.
        for(const fact of cited){
          if(!fact?.id.endsWith(':cost-per-result'))continue;
          const unit=fact.display.split(' — cost per ').at(-1)?.split(': ')[0];
          const wrongBinding=[f.title,f.interpretation,f.action,f.reason].some(prose=>{
            const token='{{'+fact.id+'}}',index=prose.indexOf(token);if(index<0)return false;
            return /\bcost per (?:reach|person reached|lead|purchase)(?:\s+(?:was|is|at|of))?\s*$/i.test(prose.slice(0,index))||/^\s*(?:as |for )?cost per (?:reach|person reached|lead|purchase)\b/i.test(prose.slice(index+token.length));
          });
          if(unit&&/thruplays?/i.test(unit)&&wrongBinding)
            throw Error('The cited cost per ThruPlay cannot substantiate cost per reach, lead or purchase. Keep the supplied outcome unit.');
        }
        validateReviewClaims(f);
        if(f.category==='win'&&f.tone!=='ok')throw Error('A measured win must use ok tone; concerns and data gaps are not wins.');
        const render=(prose:string,proposal=false)=>bindMeasuredText(prose,f.evidenceIds,facts,evidence,proposal);
        return {
          tone: f.tone,
          title: render(f.title),
          detail:
            cited.map((fact) => fact!.display).join(". ") +
            ". " +
            render(f.interpretation),
          action: render(f.action,true),
          reason: render(f.reason),
          interpretation:render(f.interpretation),
          evidence:cited.map(fact=>fact!.display),
          evidenceIds:f.evidenceIds,
          priority:f.priority??(f.tone==='crit'?'now':f.tone==='warn'?'next':'monitor'),
          category:f.category??(f.tone==='ok'?'win':'concern'),
        };
      })
      .sort(
        (a, b) =>
          ({ crit: 0, warn: 1, ok: 2 })[a.tone] -
          { crit: 0, warn: 1, ok: 2 }[b.tone],
      );
    return { periodId: p.periodId, findings };
  });
}
/** Retain strictly verified observations from complete, known window envelopes.
 * Empty or wholly unsupported windows still fail; no invented fallback prose. */
export function recoverDailyFindings(responses:unknown[],evidence:ReturnType<typeof dailyEvidence>){
  const envelope=z.object({periods:z.array(z.object({periodId:text(40),findings:z.array(z.unknown()).min(1).max(100)})).min(1).max(2)});
  const valid=new Map(evidence.periods.map(p=>[p.id,new Map<string,ReportFinding>()]));
  const rejected=new Map<string,{periodId:string;title:string;reason:string}>();
  const expected=new Set(evidence.periods.map(p=>p.id));
  const key=(title:string)=>title.trim().toLowerCase();
  for(const raw of [...responses].reverse()){
    const parsed=envelope.safeParse(raw);if(!parsed.success)continue;
    if(parsed.data.periods.length!==expected.size||new Set(parsed.data.periods.map(p=>p.periodId)).size!==expected.size||parsed.data.periods.some(p=>!expected.has(p.periodId)))continue;
    for(const p of parsed.data.periods){
      const subset={...evidence,periods:evidence.periods.filter(window=>window.id===p.periodId),facts:evidence.facts.filter(f=>f.periodId===p.periodId)};
      for(const [index,finding] of p.findings.entries()){
        const title=finding&&typeof finding==='object'&&'title' in finding&&typeof finding.title==='string'?finding.title:'Unstructured observation '+index;
        const identity=key(title);
        try{
          const checked=validateDailyAnalysis({periods:[{periodId:p.periodId,findings:[finding]}]},subset)[0].findings[0];
          if(!valid.get(p.periodId)!.has(identity))valid.get(p.periodId)!.set(identity,checked);
        }catch(error){
          const id=p.periodId+':'+identity;
          if(!rejected.has(id))rejected.set(id,{periodId:p.periodId,title,reason:error instanceof Error?error.message.slice(0,1800):'Verification failed'});
        }
      }
    }
  }
  const omitted=[...rejected.values()].filter(item=>!valid.get(item.periodId)?.has(key(item.title)));
  const periods=evidence.periods.map(p=>{
    const verified=[...valid.get(p.id)!.values()];
    if(!verified.length)throw Error('No verified AI finding was available for '+p.id+'. The account review remains incomplete.');
    const count=omitted.filter(item=>item.periodId===p.id).length;
    return {periodId:p.id,findings:verified.sort((a,b)=>({crit:0,warn:1,ok:2})[a.tone]-({crit:0,warn:1,ok:2})[b.tone]).slice(0,6),notes:[count?'AI review with limitations: '+count+' proposed observation'+(count===1?' was':'s were')+' omitted because '+(count===1?'it did':'they did')+' not pass evidence checks. Only verified findings are shown.':'The AI review required correction. Only findings that passed the evidence checks are shown.']};
  });
  return {periods,rejected:omitted};
}

function executeDailyReview(skill:ReportingSkill,input:unknown,evidence:ReturnType<typeof dailyEvidence>,upstreamNotes=new Map<string,string[]>()){
  const annotate=(periods:DailyAnalysis['periods'])=>periods.map(p=>({...p,...((p.notes?.length||upstreamNotes.get(p.periodId)?.length)?{notes:[...new Set([...p.notes??[],...upstreamNotes.get(p.periodId)??[]])]}:{})}));
  return runReportSkill(skill,input,raw=>annotate(validateDailyAnalysis(raw,evidence)),{
    upstreamLimited:[...upstreamNotes.values()].some(notes=>notes.length>0),
    recover:responses=>{const result=recoverDailyFindings(responses,evidence);return {output:annotate(result.periods),validation:{rejected:result.rejected}};},
  });
}

export async function analyzeDailyReport(
  report: Report,
  skill: ReportingSkill,
  checkpoint?:DailyReviewCheckpoint,
): Promise<DailyAnalysis> {
  const evidence = dailyEvidence(report);
  const batches=partitionDailyEvidence(evidence);
  if(batches.length===1){
    const result=await executeDailyReview(skill,modelInput(evidence),evidence);
    return {run:result.run,periods:result.output};
  }
  const reviewed:(ReviewedBatch|null)[]=Array(batches.length).fill(null);
  const keys=batches.map(batch=>hash(JSON.stringify({skill:skillVersion(skill).packageHash,evidence:modelInput(batch)})));
  if(checkpoint)for(let i=0;i<batches.length;i++){
    const cached=await checkpoint.load(keys[i]);
    if(cached&&cached.run.skill.packageHash===skillVersion(skill).packageHash&&cached.run.evidenceHash===hash(JSON.stringify(modelInput(batches[i]))))reviewed[i]=cached;
  }
  // Bound simultaneous Bedrock work. Every batch is persisted with the pinned
  // skill and its exact input before its findings can enter the final synthesis.
  const pending=reviewed.flatMap((r,i)=>r?[]:[i]);
  const scheduled=checkpoint?pending.slice(0,2):pending;
  for(let i=0;i<scheduled.length;i+=2){
    await Promise.all(scheduled.slice(i,i+2).map(async index=>{
      const batch=batches[index],result=await executeDailyReview(skill,modelInput(batch),batch);
      if(checkpoint)await checkpoint.save(keys[index],result);
      reviewed[index]=result;
    }));
  }
  // Yield large reviews between serverless requests. Cached input and completed
  // batches survive retries, and synthesis receives its own execution budget.
  if(checkpoint&&scheduled.length)throw new DailyReviewProgress(reviewed.filter(Boolean).length,batches.length+1);
  const complete=reviewed as ReviewedBatch[];
  const {input,evidence:synthesis}=boundedSynthesis(evidence,complete);
  const upstreamNotes=new Map(evidence.periods.map(p=>[p.id,complete.some(batch=>batch.output.some(period=>period.periodId===p.id&&period.notes?.length))?['Supporting AI reviews omitted observations that did not pass evidence checks. Only verified findings were used in this summary.']:[]]));
  const result=await executeDailyReview(skill,input,synthesis,upstreamNotes);
  return {run:result.run,periods:result.output,supportingRuns:complete.map(r=>r.run)};
}

type ReviewedBatch={output:ReturnType<typeof validateDailyAnalysis>;run:SkillRun};
export type DailyReviewCheckpoint={load:(key:string)=>Promise<ReviewedBatch|null>;save:(key:string,value:ReviewedBatch)=>Promise<void>};
export class DailyReviewProgress extends Error {
  constructor(readonly done:number,readonly total:number){super('Large-account review saved; continue the next batch.');}
}

function modelInput(evidence:ReturnType<typeof dailyEvidence>,compact=false){
  return {...evidence,facts:evidence.facts.map(({display,periodId,...fact})=>{
    // Preserve the metric's meaning. A generic cost-per-result number without
    // its label can otherwise be mistaken for cost per reach, lead or view.
    const labelled={...fact,label:display.split(' — ').at(-1)!.split(': ')[0]};
    if(!compact||!/:ad:/.test(fact.id)||!fact.value||typeof fact.value!=='object')return labelled;
    const value=fact.value as {days?:Record<string,unknown>[]};
    const keys=['day','spend','impressions','clicks','ctr','cpc','frequency','purchases','leads'];
    return {...labelled,value:{...value,dayColumns:keys,days:(value.days??[]).map(row=>keys.map(k=>row[k]??null))}};
  })};
}

function boundedSynthesis(evidence:ReturnType<typeof dailyEvidence>,reviewed:ReviewedBatch[]){
  const all=reviewed.flatMap(r=>r.output.flatMap(p=>p.findings.map(({tone,title,interpretation,evidenceIds,priority,category,action,reason})=>({periodId:p.periodId,tone,title,interpretation,evidenceIds,priority,category,action,reason}))));
  const rank={now:0,next:1,monitor:2},severity={crit:0,warn:1,ok:2};
  all.sort((a,b)=>rank[a.priority??'monitor']-rank[b.priority??'monitor']||severity[a.tone]-severity[b.tone]||a.title.localeCompare(b.title));
  // Every source batch has been reviewed. The final report is a deliberately
  // concise priority summary; retain the complete batch records for inspection.
  const candidates=evidence.periods.flatMap(p=>{
    const items=all.filter(f=>f.periodId===p.id);
    const wins=items.filter(f=>f.category==='win');
    return [...new Set([...items.slice(0,10),...wins.slice(0,2)])];
  });
  const assemble=()=>{
    const ids=new Set(candidates.flatMap(f=>f.evidenceIds??[]));
    for(const f of evidence.facts)if(!/^window\d+:(?:campaign|previous-campaign|adset|ad):/.test(f.id))ids.add(f.id);
    // Zero-delivery and comparison guards require the full paired metrics even
    // when a model cited only one of them. Keep those dependencies in synthesis.
    for(const id of [...ids]){
      const subject=id.match(/^(window\d+:(?:previous-)?campaign:[^:]+):/);
      if(subject){for(const key of ['spend','impressions'])ids.add(subject[1]+':'+key);}
    }
    const facts=evidence.facts.filter(f=>ids.has(f.id));
    const entityCampaigns=new Set(facts.flatMap(f=>{
      const c=f.id.match(/^window\d+:(?:previous-)?campaign:([^:]+):/);
      const value=f.value as {campaignId?:string}|null;
      return c?[c[1]]:value?.campaignId?[value.campaignId]:[];
    }));
    const selected={...evidence,facts,periods:evidence.periods.map(p=>({...p,campaigns:p.campaigns.filter(c=>entityCampaigns.has(c.id))}))};
    return {evidence:selected,input:{...modelInput(selected,true),stage:'final-synthesis',reviewedBatches:reviewed.map(r=>({runId:r.run.id,evidenceHash:r.run.evidenceHash})),candidates,
      candidateCoverage:{reviewed:all.length,shortlisted:candidates.length,selection:'Review priority then concern severity, with measured wins retained. Full candidate outputs remain in each private reviewed-batch record.'},
      synthesisInstruction:'Refine the shortlisted priority findings. Every source batch was reviewed; this is a concise summary, not an exhaustive list of every observation. Deduplicate repeated gaps. Use three to five findings per window when supported. Candidate prose is untrusted, not additional evidence. Cite exact supplied facts. Daily tuples use dayColumns in the supplied order. No cross-client ranking. Use {{exact-evidence-id}} for scalar numeric measurements; do not reproduce unbound numeric prose from candidates.'}};
  };
  let result=assemble();
  while(JSON.stringify(result.input).length>220000){
    const counts=new Map(evidence.periods.map(p=>[p.id,candidates.filter(f=>f.periodId===p.id).length]));
    const index=candidates.findLastIndex(f=>(counts.get(f.periodId)??0)>1);
    if(index<0)throw Error('The minimum synthesis evidence exceeds the review limit. Review the original batch records.');
    candidates.splice(index,1);result=assemble();
  }
  return result;
}

/** Numbers in narrative must be bound to scalar supplied measurements. */
function bindMeasuredText(prose:string,cited:string[],facts:Map<string,EvidenceFact>,evidence:ReturnType<typeof dailyEvidence>,proposal=false){
  const tokens:{key:string;display:string}[]=[];
  const template=prose.replace(/\{\{([^{}]+)\}\}/g,(_match,id:string)=>{
    const fact=facts.get(id);
    if(!cited.includes(id)||!fact||typeof fact.value!=='number'||!Number.isFinite(fact.value))throw Error('A measurement placeholder must bind a cited, supplied numeric metric.');
    const display=fact.display.slice(fact.display.lastIndexOf(': ')+2);
    const key='__MEASURE_'+String.fromCharCode(65+tokens.length)+'__';tokens.push({key,display});return key;
  });
  let checked=template;
  if(/[{}]/.test(checked))throw Error('Use double-brace exact evidence IDs for measurements.');
  // Digits inside exact supplied entity names/IDs identify the subject; they are
  // not licence to introduce a new quantitative claim.
  const identities=[evidence.account.name,evidence.account.id,...evidence.periods.flatMap(p=>p.campaigns.flatMap(c=>[c.name,c.id])),...evidence.facts.flatMap(f=>f.value&&typeof f.value==='object'&&'name' in f.value&&typeof f.value.name==='string'?[f.value.name]:[])].filter(v=>v.length>2).sort((a,b)=>b.length-a.length);
  for(const identity of identities)checked=checked.split(identity).join('ENTITY');
  // Dated window labels describe source metadata, not replacement KPI claims.
  // Previously even a correct "7-day review" was rejected by the digit guard.
  const period=evidence.periods.find(p=>cited.some(id=>id.startsWith(p.id+':')));
  if(period){
    const duration=Math.round((Date.parse(period.window.until)-Date.parse(period.window.since))/86400000)+1;
    checked=checked.replace(new RegExp('\\b'+duration+'(?:[- ]day(?:s)?|[- ]d)\\b','gi'),'REPORTING_PERIOD');
    for(const date of [period.window.since,period.window.until])checked=checked.split(date).join('REPORTING_DATE');
  }
  if(proposal)checked=checked.replace(/\b(?:test|draft|prepare|produce|compare)\s+(?:[1-3]|one|two|three)(?:\s+(?:new|fresh))?\s+(?:creatives?|variants?|concepts?)\b/gi,'PROPOSED_CREATIVE_TEST');
  checked=groundLiteralMeasurements(checked,cited,facts,evidence.account.currency);
  if(/\d/.test(checked)||/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand)\s+(?:purchases?|leads?|visits?|clicks?|conversations?|percent)\b/i.test(checked))throw Error('Unbound numeric claim in '+JSON.stringify(prose.slice(0,220))+'. Use a cited metric with its exact supplied value, or bind it with {{exact-evidence-id}}. Source-period labels are allowed; invented or ungrounded KPI values are not.');
  let rendered=template;for(const token of tokens)rendered=rendered.split(token.key).join(token.display);return rendered;
}

/** Accept ordinary metric wording only when both the metric and displayed value
 * match cited evidence. The model's placeholder syntax is not a reliability
 * dependency, and a number appearing somewhere in the input is insufficient. */
function groundLiteralMeasurements(prose:string,cited:string[],facts:Map<string,EvidenceFact>,currency:string){
  const aliases:Record<string,RegExp>={
    spend:/\b(?:spend|spent|budget used)\b/gi,impressions:/\bimpressions?\b/gi,reach:/\b(?:reach|people reached|people)\b/gi,
    frequency:/\b(?:frequency|freq)\b/gi,clicks:/\bclicks?\b/gi,ctr:/\b(?:ctr|click.through rate)\b/gi,cpc:/\b(?:cpc|cost per click)\b/gi,
    purchases:/\b(?:purchases?|orders?)\b/gi,leads:/\bleads?\b/gi,purchaseValue:/\b(?:purchase value|attributed revenue|reported revenue)\b/gi,
    roas:/\broas\b/gi,instagramVisits:/\b(?:(?:instagram|ig) (?:profile )?visits?|profile visits?)\b/gi,facebookVisits:/\b(?:(?:facebook|fb) (?:page |profile )?visits?|page visits?)\b/gi,
    conversations:/\b(?:conversations?|chats?)\b/gi,landingViews:/\blanding.page views?\b/gi,linkClicks:/\blink clicks?\b/gi,thruplays:/\bthruplays?\b/gi,
    'cost-per-result':/\b(?:cost|at|each|per result)\b/gi,
    'cost-per-purchase':/\b(?:cpa|cpp|cost per purchase|per purchase|at|each)\b/gi,'cost-per-lead':/\b(?:cpl|cost per lead|per lead|at|each)\b/gi,
    'cost-per-visit':/\b(?:cpv|cost per (?:page |profile )?visit|per visit|at|each)\b/gi,
    'cost-per-thruplay':/\b(?:cost per thruplays?|per thruplays?|cost per result|at|each)\b/gi,
    targetCpa:/\b(?:target cpa|cpa target|approved cpa)\b/gi,targetCpl:/\b(?:target cpl|cpl target|approved cpl)\b/gi,targetRoas:/\b(?:target roas|roas target|approved roas)\b/gi,
  };
  const numberFromDisplay=(display:string)=>Number(display.replace(/[^\d.+−-]/g,'').replace('−','-'));
  const shown=(key:string,value:number)=>numberFromDisplay(['spend','cpc','purchaseValue','cost-per-result','cost-per-purchase','cost-per-lead','targetCpa','targetCpl'].includes(key)?cash(value,currency):key==='ctr'?percent(value):key==='roas'||key==='targetRoas'?ratio(value):count(value));
  const values:{key:string;value:number;shown:number;percentChange?:boolean}[]=[];
  for(const id of cited){
    const fact=facts.get(id);if(!fact)continue;
    let key=id.split(':').at(-1)!;
    if(key==='cost-per-result'){
      const outcome=fact.display.split(' — cost per ').at(-1)?.split(': ')[0].toLowerCase()??'';
      key=/lead/.test(outcome)?'cost-per-lead':/purchase/.test(outcome)?'cost-per-purchase':/visit/.test(outcome)?'cost-per-visit':/thruplay/.test(outcome)?'cost-per-thruplay':key;
    }
    if(typeof fact.value==='number'&&aliases[key])values.push({key,value:fact.value,shown:numberFromDisplay(fact.display.slice(fact.display.lastIndexOf(': ')+2))});
    if(fact.value&&typeof fact.value==='object'){
      const object=fact.value as {stats?:Record<string,unknown>;percent?:Record<string,unknown>};
      for(const [metric,value] of Object.entries(object.stats??{}))if(typeof value==='number'&&aliases[metric])values.push({key:metric,value,shown:shown(metric,value)});
      for(const [metric,value] of Object.entries(object.percent??{}))if(typeof value==='number')values.push({key:metric==='costPerResult'?'cost-per-result':metric,value,shown:Number(value.toFixed(1)),percentChange:true});
    }
  }
  if(values.some(item=>item.key==='roas'&&item.value<1))prose=prose.replace(/\bROAS (?:is |was |remains )?(?:below|under|less than)\s*1(?:\.0+)?(?:[×x])?\b/gi,'VERIFIED_BELOW_REVENUE_SPEND_PARITY');
  const ranges:{start:number;end:number;key:string}[]=[];
  for(const [key,pattern] of Object.entries(aliases))for(const match of prose.matchAll(pattern))ranges.push({key,start:match.index!,end:match.index!+match[0].length});
  const numeric=/(?:(?:CAD|USD|PKR)\s*)?(?:[$₨]\s*)?[+−-]?\d[\d,]*(?:\.\d+)?(?:\s*[%×x])?/g;
  return prose.replace(numeric,(token:string,offset:number)=>{
    const amount=Number(token.replace(/[A-Z$₨,%×x\s]/g,'').replace('−','-'));
    if(!Number.isFinite(amount))return token;
    const nearest=ranges.map(range=>({...range,distance:range.end<=offset?offset-range.end:range.start>=offset+token.length?range.start-offset-token.length:0})).sort((a,b)=>a.distance-b.distance);
    const after=prose.slice(offset+token.length);
    // A count followed by its noun must match that outcome, not a nearby spend.
    const noun=after.match(/^\s*(purchases?|orders?|leads?|impressions?|clicks?|conversations?|thruplays?)\b/i)?.[1]?.toLowerCase();
    const forced=noun?(/purchase|order/.test(noun)?'purchases':noun.replace(/s$/,'')==='lead'?'leads':noun.replace(/s$/,'')==='impression'?'impressions':noun.replace(/s$/,'')==='click'?'clicks':noun.replace(/s$/,'')==='conversation'?'conversations':'thruplays'):undefined;
    const matched=values.some(item=>{
      if(forced&&item.key!==forced)return false;
      const distance=nearest.find(range=>range.key===item.key)?.distance??Infinity;
      if(distance>28)return false;
      if(!forced&&nearest[0]&&nearest[0].distance+8<distance)return false;
      if(item.percentChange&&!token.includes('%'))return false;
      if(!item.percentChange&&token.includes('%')&&item.key!=='ctr')return false;
      const source=item.percentChange&&amount>=0?Math.abs(item.value):item.value;
      const displayed=item.percentChange&&amount>=0?Math.abs(item.shown):item.shown;
      return source===amount||displayed===amount;
    });
    return matched?'VERIFIED_MEASUREMENT':token;
  });
}

/** No silent top-N cutoff: large accounts are split into complete bounded evidence batches. */
export function partitionDailyEvidence(evidence:ReturnType<typeof dailyEvidence>,limit=155000){
  if(JSON.stringify(modelInput(evidence)).length<=limit)return [evidence];
  const batches:ReturnType<typeof dailyEvidence>[]=[];
  for(const period of evidence.periods){
    const shared=evidence.facts.filter(f=>f.periodId===period.id&&!/:(?:campaign|previous-campaign|adset|ad):/.test(f.id));
    const groups=new Map<string,EvidenceFact[]>();
    for(const fact of evidence.facts.filter(f=>f.periodId===period.id&&!shared.includes(f))){
      const match=fact.id.match(/^window\d+:(?:previous-)?campaign:([^:]+):/);
      const value=fact.value as {campaignId?:string}|null;
      const key=match?.[1]??value?.campaignId??fact.id;
      groups.set(key,[...groups.get(key)??[],fact]);
    }
    const make=(facts:EvidenceFact[],campaignIds:Set<string>)=>({...evidence,periods:[{...period,campaigns:period.campaigns.filter(c=>campaignIds.has(c.id))}],facts:[...shared,...facts],instructions:evidence.instructions+' This is a partial account evidence batch. Review only supplied entities; do not claim full-account creative coverage from this batch.'});
    let current:EvidenceFact[]=[],campaignIds=new Set<string>();
    for(const [key,group] of groups){
      const nextGroup=make([...current,...group],new Set([...campaignIds,key]));
      if(JSON.stringify(modelInput(nextGroup)).length<=limit){current.push(...group);campaignIds.add(key);continue;}
      if(current.length){batches.push(make(current,campaignIds));current=[];campaignIds=new Set();}
      if(JSON.stringify(modelInput(make(group,new Set([key])))).length<=limit){current=group;campaignIds.add(key);continue;}
      // Split an unusually large campaign by individual ad/adset fact, retaining
      // each fact once; campaign identity stays in each fact's value.
      for(const fact of group){
        const next=make([...current,fact],new Set([...campaignIds,key]));
        if(current.length&&JSON.stringify(modelInput(next)).length>limit){batches.push(make(current,campaignIds));current=[];campaignIds=new Set();}
        current.push(fact);campaignIds.add(key);
        if(JSON.stringify(modelInput(make(current,campaignIds))).length>235000)throw Error('An individual ad evidence record exceeds the review limit.');
      }
    }
    if(current.length||!groups.size)batches.push(make(current,campaignIds));
  }
  return batches;
}

function validateReviewClaims(f:{title:string;interpretation:string;action:string;reason:string}){
  const prose=[f.title,f.interpretation,f.action,f.reason].join(' ');
  if(/\b(?:fatigue (?:is )?(?:confirmed|proven)|(?:confirmed|proven|critical|severe) (?:creative |audience )?fatigue|(?:confirms?|proves?) (?:creative |audience )?fatigue|frequency (?:is the cause|caused|is causing)|zero new viewers|every dollar is wasted|(?:will|guaranteed to) (?:recover|restore|decline))\b/i.test(prose))throw Error('Unsupported certainty about fatigue, causality, reach or future outcomes. Describe the measured trend and the review or test needed.');
  if(/\b(?:profitable|profitability|net (?:loss|profit))\b/i.test(prose)&&!/\b(?:cannot|not establish|not confirm|unknown|margin|unverified)\b/i.test(prose))throw Error('Attributed ROAS alone does not establish profitability; margins and incrementality were not supplied.');
  if(/\b\d+\s+qualified leads\b|\b(?:generating|generated|delivering) qualified leads\b/i.test(prose))throw Error('Reported Meta leads are not independently verified qualified leads.');
  if(/\b(?:leads?|conversations?) (?:are|were|is|was|have been) (?:all )?qualified\b|\bqualified leads? (?:generated|reported|delivered)\b/i.test(prose))throw Error('Reported leads or conversations do not prove qualification.');
  if(/\btracking (?:is )?(?:broken|failed)|\bfix (?:the )?(?:purchase )?pixel\b/i.test(prose))throw Error('Imported outcome data does not prove broken tracking. Recommend reconciliation before a diagnosis.');
}
