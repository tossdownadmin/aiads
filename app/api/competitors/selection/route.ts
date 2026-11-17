import { NextResponse } from 'next/server';
import { z } from 'zod';
import { paidSourceSession } from '../../../../lib/competitors/auth';
import { clientCatalog } from '../../../../lib/competitors/catalog';
import { readCompetitors, writeCompetitors } from '../../../../lib/competitors/store';

export const runtime = 'nodejs';
const competitor = z.object({ id: z.string().min(1).max(100), name: z.string().min(1).max(200), domain: z.string().regex(/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i).max(200), website: z.string().url().optional(), reviewed: z.literal(true).optional() });
const input = z.object({ clientId: z.string().max(80), competitors: z.array(competitor).max(10) });

export async function GET(request: Request) {
  const session = await paidSourceSession();
  if (!session) return NextResponse.json({ error: 'Sign in to view saved advertiser selections.' }, { status: 401 });
  const clientId = new URL(request.url).searchParams.get('clientId') || '';
  if (!clientCatalog.some(client => client.id === clientId)) return NextResponse.json({ error: 'Unknown client brand.' }, { status: 404 });
  try { return NextResponse.json({ competitors: await readCompetitors(clientId) }, { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch { return NextResponse.json({ error: 'Saved advertisers are unavailable.' }, { status: 502 }); }
}

export async function PUT(request: Request) {
  const session = await paidSourceSession();
  if (!session?.user?.email) return NextResponse.json({ error: 'Sign in to save advertiser selections.' }, { status: 401 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !clientCatalog.some(client => client.id === parsed.data.clientId)) return NextResponse.json({ error: 'Invalid advertiser selection.' }, { status: 400 });
  const ids = parsed.data.competitors.map(item => item.id);
  if (new Set(ids).size !== ids.length) return NextResponse.json({ error: 'Duplicate advertiser ID.' }, { status: 400 });
  try {
    await writeCompetitors(parsed.data.clientId, parsed.data.competitors, session.user.email);
    return NextResponse.json({ competitors: parsed.data.competitors }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'Could not save advertiser selections.' }, { status: 502 }); }
}
