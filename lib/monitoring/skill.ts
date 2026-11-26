import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { SkillRecord } from '../skills/types';
import config from '../../skills/monitoring/meta-operations/manifest.json';

const schema=z.object({name:z.literal('meta-operations-monitor'),version:z.string().regex(/^\d+\.\d+\.\d+$/),contract:z.literal('meta-monitor-v1'),description:z.string(),rules:z.array(z.object({id:z.string(),label:z.string(),weight:z.number().int().positive()})),thresholds:z.object({minimumOutcomes:z.string(),costIncrease:z.string(),creativeImpressions:z.string(),frequencyIncrease:z.string(),ctrDecrease:z.string()})});
export function monitoringSkill() {
  const manifest=schema.parse(config),body=readFileSync(resolve(process.cwd(),'skills/monitoring/meta-operations/SKILL.md'),'utf8');
  return {...manifest,hash:createHash('sha256').update(JSON.stringify({manifest,body})).digest('hex'),body};
}
export function getMonitoringSkill():SkillRecord&{body:string;original:string;files:string[];fetchedAt:string} {
  const method=monitoringSkill();return {name:method.name,description:method.description,source:'tossdown-aiads',path:'skills/monitoring/meta-operations/SKILL.md',sha:method.hash,license:'Proprietary',categories:['monitoring','alerts','optimization'],platforms:['meta'],status:'approved',risk:'low',findings:[],writeActions:false,adaptationStatus:'native',body:method.body,original:method.body,files:['manifest.json','SKILL.md'],fetchedAt:'built-in',contract:method.contract,requirements:['meta-account-insights','meta-ad-insights','client-report-context']};
}
