import {randomUUID} from 'node:crypto';
import {ReportModelError,ReportSkillError} from '../skills/report-errors';

export type DailyStage='accounts'|'context'|'evidence'|'analysis'|'saving';
export type DailyFailure={stage:DailyStage;code:string;reference:string;runId?:string;message:string};

/** Public messages are controlled application text, never raw SDK/errors or tokens. */
export function describeDailyFailure(stage:DailyStage,error:unknown):DailyFailure{
  const reference=randomUUID();
  if(error instanceof ReportSkillError){
    const messages={analysis_validation:'The AI review did not pass the report format or evidence checks after two attempts. Open the error details to see which check failed.',analysis_storage:'The AI review passed its checks, but saving it failed. Resume to retry; the previous report is safe.',analysis_input:'This account’s evidence could not fit into the analysis step. The review needs a smaller batch.'};
    return {stage,code:error.code,reference:error.reference,...(error.code==='analysis_validation'?{runId:error.reference}:{}),message:messages[error.code]};
  }
  if(error instanceof ReportModelError){
    const messages={model_configuration:'The analysis service is not configured. Its server settings need to be corrected before retrying.',model_access:'Amazon Bedrock denied access to the analysis model. Its model permissions need to be corrected before retrying.',model_request:'Amazon Bedrock rejected the model request. Its model or inference settings need to be checked before retrying.',model_response:'The AI service returned an incomplete report response. Resume to retry this account.',model_unavailable:'The analysis service could not complete the request. Resume to retry this account.'};
    return {stage,code:error.code,reference,message:messages[error.code]};
  }
  const denied=!!error&&typeof error==='object'&&('status' in error&&error.status===403||'code' in error&&[10,190,200,294].includes(Number(error.code)));
  const rateLimited=!!error&&typeof error==='object'&&('status' in error&&error.status===429||'code' in error&&[4,17,32,613,80004].includes(Number(error.code)));
  const messages:Record<DailyStage,string>={accounts:'The connected Meta accounts could not be verified. Check the Meta connection before retrying.',context:'Saved business context could not be loaded. Resume to retry loading the saved goals and targets.',evidence:denied?'Meta denied access while reading this account’s report evidence. Review the token’s account permissions.':rateLimited?'Meta rate-limited this evidence read. Wait briefly, then resume.':'Meta report evidence could not be read completely. Resume to retry this account.',analysis:'The account’s analysis step failed. The runtime log has the underlying reason under the reference below.',saving:'The report could not be saved. Resume to retry; the previous saved report is safe.'};
  return {stage,code:denied?'meta_access':rateLimited?'meta_rate_limit':stage+'_unavailable',reference,message:messages[stage]};
}
