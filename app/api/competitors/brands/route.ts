import { NextResponse } from 'next/server';
import { z } from 'zod';
import { findForeplayBrandsByDomain, findForeplayBrandsByName } from '../../../../lib/competitors/foreplay';
import { verifyPaidSourceSession } from '../../../../lib/competitors/access';

export const runtime = 'nodejs';
const schema = z.object({ domain: z.string().trim().regex(/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i).max(200), name: z.string().trim().max(120).optional() });

export async function POST(request: Request) {
  if (!await verifyPaidSourceSession()) return NextResponse.json({ error: 'Sign-in is required to look up Foreplay brands.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid competitor website domain.' }, { status: 400 });
  try {
    const domainCandidates = await findForeplayBrandsByDomain(parsed.data.domain);
    const candidates = domainCandidates.length || !parsed.data.name ? domainCandidates : await findForeplayBrandsByName(parsed.data.name, parsed.data.domain);
    return NextResponse.json({ candidates, lookupMethod: domainCandidates.length ? 'domain' : parsed.data.name ? 'name' : 'domain' }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const status = (error as { httpStatus?: number }).httpStatus;
    console.error('Foreplay brand lookup failed', { httpStatus: status });
    const message = status === 401 ? 'Foreplay rejected the API key. Check FOREPLAY_API_KEY in Vercel.' : status === 402 ? 'Foreplay API credits are exhausted.' : status === 403 ? 'This Foreplay plan cannot access brand lookup.' : 'Brand lookup failed. Check the Vercel Function log.';
    return NextResponse.json({ error: message }, { status: status === 402 ? 402 : 502 });
  }
}
