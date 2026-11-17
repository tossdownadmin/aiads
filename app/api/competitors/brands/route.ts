import { NextResponse } from 'next/server';
import { z } from 'zod';
import { findForeplayBrandsByDomain } from '../../../../lib/competitors/foreplay';
import { verifyPaidSourceSession } from '../../../../lib/competitors/access';

export const runtime = 'nodejs';
const schema = z.object({ domain: z.string().trim().regex(/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i).max(200) });

export async function POST(request: Request) {
  if (!await verifyPaidSourceSession()) return NextResponse.json({ error: 'Sign-in is required to look up Foreplay brands.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid competitor website domain.' }, { status: 400 });
  try {
    return NextResponse.json({ candidates: await findForeplayBrandsByDomain(parsed.data.domain) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Foreplay brand lookup failed', { httpStatus: (error as { httpStatus?: number }).httpStatus });
    return NextResponse.json({ error: 'Brand lookup failed. Check Foreplay access and the Vercel Function log.' }, { status: 502 });
  }
}
