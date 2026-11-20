import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdminSession } from '../../../../../lib/auth';
import { getAdAccounts } from '../../../../../lib/meta/read';
import {
  ClientContextConflict,
  clientContextInputSchema,
  readVersionedClientContext,
  writeClientContext,
} from '../../../../../lib/reports/client-context';

export const runtime = 'nodejs';
const accountId = z.string().regex(/^act_\d+$/);
const update = z.object({
  accountId,
  version: z.string().min(1).max(200).nullable(),
  context: clientContextInputSchema,
}).strict();
const reply = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'private, no-store' },
});

export async function GET(request: Request) {
  if (!await verifyAdminSession()) return reply({ error: 'Sign in to read report context.' }, 401);
  const id = accountId.safeParse(new URL(request.url).searchParams.get('accountId'));
  if (!id.success) return reply({ error: 'Choose a connected Meta ad account.' }, 400);
  try {
    const account = (await getAdAccounts()).find(a => a.id === id.data);
    if (!account) return reply({ error: 'The account is unavailable to this connection.' }, 403);
    const result = await readVersionedClientContext(account.id);
    return reply({
      account: { id: account.id, name: account.name, currency: account.currency },
      ...result,
    });
  } catch {
    return reply({ error: 'The saved report context could not be opened. Retry loading it.' }, 503);
  }
}

/** Full replacement of editable fields; omitted optional targets are cleared. */
export async function PUT(request: Request) {
  if (!await verifyAdminSession()) return reply({ error: 'Sign in to edit report context.' }, 401);
  const input = update.safeParse(await request.json().catch(() => null));
  if (!input.success) return reply({
    error: 'Check the account and version. Use positive targets and budgets, a YYYY-MM budget month (required with a monthly budget), and at most 1,200 characters per note.',
  }, 400);
  try {
    const account = (await getAdAccounts()).find(a => a.id === input.data.accountId);
    if (!account) return reply({ error: 'The account is unavailable to this connection.' }, 403);
    const result = await writeClientContext(account, input.data.context, input.data.version);
    return reply({ account: { id: account.id, name: account.name, currency: account.currency }, ...result });
  } catch (error) {
    if (error instanceof ClientContextConflict) return reply({ error: error.message }, 409);
    return reply({ error: 'The report context could not be saved. Retry or reload the saved context.' }, 503);
  }
}
