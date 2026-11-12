import { NextResponse } from 'next/server';
import { z } from 'zod';
import { decideSkill } from '../../../../lib/skills/store';
export const runtime = 'nodejs';
const bodySchema = z.object({ pathname: z.string().min(1), decision: z.enum(['approved','rejected']) });
export async function POST(request: Request) {
  const secret = process.env.SKILLS_SYNC_CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid review request', details: parsed.error.flatten() }, { status: 400 });
  try { return NextResponse.json(await decideSkill(parsed.data.pathname, parsed.data.decision)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Review failed' }, { status: 400 }); }
}
