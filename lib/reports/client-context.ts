import { BlobNotFoundError, BlobPreconditionFailedError, get, put } from '@vercel/blob';
import { z } from 'zod';
import type { MetaAccount } from '../meta/read';

const accountId = z.string().regex(/^act_\d+$/);
const positive = z.number().finite().positive().optional();
const fields = z.object({
  businessGoal: z.string().trim().max(1200).default(''),
  primaryOutcome:z.enum(['purchases','leads','instagramVisits','facebookVisits','conversations','thruplays','reach','landingViews','linkClicks']).optional(),
  conversionDefinition:z.string().trim().max(1200).optional(),
  markets:z.string().trim().max(1200).optional(),
  approvedOffers:z.string().trim().max(1200).optional(),
  creativeRestrictions:z.string().trim().max(1200).optional(),
  targetOwner:z.string().trim().max(200).optional(),
  approvedOn:z.string().date().optional(),
  validUntil:z.string().date().optional(),
  targetCostPerResult:positive,
  targetCpa: positive,
  targetCpl: positive,
  targetRoas: positive,
  monthlyBudget: positive,
  budgetMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  // Team-reported qualification context, never CRM-verified outcomes.
  qualificationNotes: z.string().trim().max(1200).default(''),
}).strict();
const hasBudgetMonth = (value: { monthlyBudget?: number; budgetMonth?: string }) =>
  value.monthlyBudget === undefined || value.budgetMonth !== undefined;
const budgetMonthError = { message: 'Choose a budget month when setting a monthly budget.', path: ['budgetMonth'] };

const validApprovalDates = (value: {approvedOn?:string;validUntil?:string}) =>
  !value.approvedOn || !value.validUntil || value.validUntil >= value.approvedOn;
const approvalDateError = {message:'Target validity must end on or after the approval date.',path:['validUntil']};
export function hasCurrentApproval(context: {targetOwner?:string;approvedOn?:string;validUntil?:string}|null|undefined,day:string) {
  return !!context?.targetOwner?.trim() && !!context.approvedOn && context.approvedOn<=day && !!context.validUntil && context.validUntil>=day;
}
export const clientContextInputSchema = fields.refine(hasBudgetMonth, budgetMonthError).refine(validApprovalDates,approvalDateError);
export type DailyClientContextInput = z.infer<typeof clientContextInputSchema>;
const storedContextSchema = fields.extend({
  accountId,
  currency: z.string().regex(/^[A-Z]{3}$/),
  updatedAt: z.string().datetime(),
}).refine(hasBudgetMonth, budgetMonthError).refine(validApprovalDates,approvalDateError);

export type DailyClientContext = z.infer<typeof storedContextSchema>;
export class ClientContextConflict extends Error {
  constructor() {
    super('Another teammate changed this context. Reload the saved context before saving again.');
  }
}
const contextPath = (id: string) => 'reports/client-context/' + accountId.parse(id) + '.json';

/** Server-only storage read; callers enforce session and connected-account access. */
export async function readVersionedClientContext(id: string): Promise<{
  context: DailyClientContext | null;
  version: string | null;
}> {
  let file;
  try {
    file = await get(contextPath(id), { access: 'private', useCache: false });
  } catch (error) {
    if (error instanceof BlobNotFoundError) return { context: null, version: null };
    throw error;
  }
  if (!file) return { context: null, version: null };
  if (!file.stream || !file.blob.etag) throw new Error('Saved report context unavailable.');
  const context = storedContextSchema.parse(await new Response(file.stream).json());
  if (context.accountId !== id) throw new Error('Saved report context account mismatch.');
  // Use the ETag from this body, avoiding a separate head/get race.
  return { context, version: file.blob.etag };
}

/** Missing context is optional and returns null; storage failures remain distinguishable. */
export async function readClientContext(accountId: string): Promise<DailyClientContext | null> {
  return (await readVersionedClientContext(accountId)).context;
}

/** Pass the actual connected account, never currency or timestamps from a client. */
export async function writeClientContext(
  account: Pick<MetaAccount, 'id' | 'currency'>,
  input: DailyClientContextInput,
  version: string | null,
): Promise<{ context: DailyClientContext; version: string }> {
  z.string().min(1).max(200).nullable().parse(version);
  const context = storedContextSchema.parse({
    ...clientContextInputSchema.parse(input),
    accountId: account.id,
    currency: account.currency,
    updatedAt: new Date().toISOString(),
  });
  try {
    const blob = await put(contextPath(account.id), JSON.stringify(context), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: version !== null,
      contentType: 'application/json',
      ...(version !== null ? { ifMatch: version } : {}),
    });
    return { context, version: blob.etag };
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError || (error instanceof Error && /already exists/i.test(error.message))) {
      throw new ClientContextConflict();
    }
    throw error;
  }
}
