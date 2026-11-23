import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import {ReportModelError} from '../skills/report-errors';

let client: BedrockRuntimeClient | undefined;
function getClient() {
  const region = process.env.AWS_REGION;
  if (!region || !process.env.BEDROCK_MODEL_ID || !process.env.AWS_BEARER_TOKEN_BEDROCK) return undefined;
  client ??= new BedrockRuntimeClient({ region });
  return client;
}

function describeBedrockFailure(error: unknown): string {
  const failure = error as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  if (failure?.name === 'AccessDeniedException' || failure?.$metadata?.httpStatusCode === 403) {
    return 'Amazon Bedrock denied model access (HTTP 403). Check that the API key can invoke BEDROCK_MODEL_ID in AWS_REGION.';
  }
  if (failure?.name === 'ValidationException' || failure?.$metadata?.httpStatusCode === 400) {
    const detail = failure.message || '';
    if (/on-demand throughput|inference profile/i.test(detail)) {
      return 'This Bedrock model requires an inference profile. Set BEDROCK_MODEL_ID to the supported inference profile ID for AWS_REGION, then redeploy.';
    }
    if (/model identifier|model id|model not found|does not exist|not available/i.test(detail)) {
      return 'BEDROCK_MODEL_ID is invalid or unavailable in AWS_REGION. Check the model or inference profile ID in the Bedrock console, then redeploy.';
    }
    return 'Bedrock rejected the model request (HTTP 400). Check the validation message in the Vercel Function log for the exact model, region, or request constraint.';
  }
  return 'Claude analysis failed in Amazon Bedrock. Check the Vercel Function log for the error name and HTTP status.';
}

function logBedrockFailure(operation: string, error: unknown) {
  const failure = error as { name?: string; message?: string; $metadata?: { httpStatusCode?: number; requestId?: string } };
  console.error(`Bedrock ${operation} analysis failed`, {
    name: failure?.name || 'UnknownError',
    httpStatusCode: failure?.$metadata?.httpStatusCode,
    requestId: failure?.$metadata?.requestId,
    validationMessage: failure?.name === 'ValidationException'
      ? (failure.message || '').replace(/[\r\n\t]/g, ' ').slice(0, 500)
      : undefined,
  });
}

export async function invokeReportModel(instructions: string, evidence: string): Promise<unknown> {
  const bedrock = getClient();
  const modelId = process.env.BEDROCK_MODEL_ID;
  if (!bedrock || !modelId) throw new ReportModelError('model_configuration','The reporting analysis service is not configured.');
  let response;
  try {
    response = await bedrock.send(new ConverseCommand({
      modelId, system: [{ text: instructions }], messages: [{ role: 'user', content: [{ text: evidence }] }],
      inferenceConfig: { maxTokens: 8192, temperature: 0.2 },
    }));
  } catch (error) {
    logBedrockFailure('report', error);
    const e=error as {name?:string;$metadata?:{httpStatusCode?:number}};
    const code=e.name==='AccessDeniedException'||e.$metadata?.httpStatusCode===403?'model_access':e.name==='ValidationException'||e.$metadata?.httpStatusCode===400?'model_request':'model_unavailable';
    throw new ReportModelError(code,describeBedrockFailure(error));
  }
  const output=response.output?.message?.content?.map(block=>block.text||'').join('')||'';
  const start=output.indexOf('{'),end=output.lastIndexOf('}');
  if(response.stopReason==='max_tokens')throw new ReportModelError('model_response','The AI response was cut off before its report was complete.');
  try{
    if(start<0||end<start)throw Error('No JSON');
    return JSON.parse(output.slice(start,end+1));
  }catch{throw new ReportModelError('model_response','The AI response was not a complete report JSON object.');}
}
