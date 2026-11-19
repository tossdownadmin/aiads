import { NextResponse } from 'next/server';
import { z } from 'zod';
import { searchMetaAdLibrary } from '../../../../lib/meta/ad-library';
import { verifyAdminSession } from '../../../../lib/auth';
import { searchForeplay } from '../../../../lib/competitors/foreplay';
import { verifyPaidSourceSession } from '../../../../lib/competitors/access';
import { clientCatalog } from '../../../../lib/competitors/catalog';
import { readClientBoard, readCompetitors } from '../../../../lib/competitors/store';

export const runtime = 'nodejs';

const schema = z.object({
  source: z.enum(['meta', 'foreplay']).default('meta'),
  boardAdvertisers:z.boolean().default(false),
  useBoard:z.boolean().default(false),
  clientId: z.string().max(80).optional(),
  brandIds: z.array(z.string().min(1).max(100)).max(10).default([]),
  searchTerms: z.string().trim().max(100).default(''),
  country: z.string().regex(/^[A-Z]{2}$/),
  activeStatus: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).default('ACTIVE'),
  searchType: z.enum(['KEYWORD_UNORDERED', 'KEYWORD_EXACT_PHRASE']).default('KEYWORD_UNORDERED'),
  mediaType: z.enum(['ALL', 'IMAGE', 'VIDEO', 'MEME', 'NONE']).default('ALL'),
  platform: z.enum(['FACEBOOK', 'INSTAGRAM', 'AUDIENCE_NETWORK', 'MESSENGER', 'WHATSAPP', 'THREADS']).optional(),
  pageIds: z.array(z.string().regex(/^\d{3,30}$/)).max(10).default([]),
  after: z.string().max(500).optional(),
}).refine(value => value.source === 'foreplay' ? (value.useBoard || value.brandIds.length > 0) : value.searchTerms.length > 0 || value.pageIds.length > 0, {
  message: 'Choose Foreplay brands, or enter Meta search terms or Page IDs.',
});

export async function GET() {
  const signedIn = await verifyPaidSourceSession();
  return NextResponse.json({
    sources: {
      meta: { configured: Boolean(process.env.META_AD_LIBRARY_TOKEN), ready: Boolean(process.env.META_AD_LIBRARY_TOKEN) },
      foreplay: { configured: Boolean(process.env.FOREPLAY_API_KEY), ready: Boolean(process.env.FOREPLAY_API_KEY && signedIn), signedIn, authConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.NEXTAUTH_SECRET && process.env.AUTH_ALLOWED_EMAILS) },
    },
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}

export async function POST(request: Request) {
  if (!await verifyAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid search' }, { status: 400 });
  if (parsed.data.source === 'foreplay') {
    if (!await verifyPaidSourceSession()) return NextResponse.json({ error: 'Sign in with an approved Google account to search Foreplay.', code: 'SIGN_IN_REQUIRED' }, { status: 403 });
    if (!process.env.FOREPLAY_API_KEY) return NextResponse.json({ error: 'Add FOREPLAY_API_KEY in Vercel to enable Foreplay search.', code: 'SOURCE_NOT_CONFIGURED' }, { status: 503 });
    try {
      if (!parsed.data.clientId || !clientCatalog.some(item => item.id === parsed.data.clientId)) return NextResponse.json({ error: 'Choose a client brand.' }, { status: 400 });
      const board=parsed.data.useBoard ? await readClientBoard(parsed.data.clientId) : null;
      if(parsed.data.useBoard && !board) return NextResponse.json({error:'Link a board for this client first.'},{status:400});
      const saved = board ? [] : await readCompetitors(parsed.data.clientId);
      if (!board && !parsed.data.brandIds.every(id => saved.some(item => item.id === id && item.reviewed === true))) return NextResponse.json({ error: 'Review and confirm each advertiser again before searching.' }, { status: 400 });
      const result = await searchForeplay({
        brandIds: parsed.data.brandIds, boardId:board?.id, boardAdvertisers:parsed.data.boardAdvertisers,
        live: parsed.data.activeStatus,
        format: parsed.data.mediaType === 'IMAGE' || parsed.data.mediaType === 'VIDEO' ? parsed.data.mediaType : 'ALL',
        platform: parsed.data.platform === 'FACEBOOK' || parsed.data.platform === 'INSTAGRAM' || parsed.data.platform === 'MESSENGER' || parsed.data.platform === 'AUDIENCE_NETWORK' ? parsed.data.platform : undefined,
        cursor: parsed.data.after,
      });
      return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
      const status = (error as { httpStatus?: number }).httpStatus;
      console.error('Foreplay search failed', { httpStatus: status });
      const message = status === 401 ? 'Foreplay rejected the API key. Check FOREPLAY_API_KEY in Vercel.' : status === 402 ? 'Foreplay API credits are exhausted.' : status === 403 ? 'This Foreplay plan cannot access brand ads.' : 'Foreplay search failed. Check the Vercel Function log.';
      return NextResponse.json({ error: message, code: 'PROVIDER_ERROR' }, { status: status === 402 ? 402 : 502 });
    }
  }
  if (!process.env.META_AD_LIBRARY_TOKEN) {
    return NextResponse.json({
      error: 'Meta Ad Library API is not connected. Add META_AD_LIBRARY_TOKEN after enabling API access for the Tossdown Meta developer app.',
      code: 'SOURCE_NOT_CONFIGURED',
    }, { status: 503 });
  }

  try {
    const result = await searchMetaAdLibrary(parsed.data);
    return NextResponse.json({
      ...result,
      coverageNote: 'Meta’s API returns general commercial ads delivered in the UK/EU within the documented window. Outside those regions, API results cover political/issue ads only. This source does not provide normal competitor spend or conversion performance.',
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    const failure = error as { providerCode?: number; providerSubcode?: number; httpStatus?: number; message?: string };
    console.error('Meta Ad Library search failed', {
      providerCode: failure.providerCode,
      providerSubcode: failure.providerSubcode,
      httpStatus: failure.httpStatus,
    });
    return NextResponse.json({
      error: 'Meta Ad Library search failed. Check API access, query coverage, and the Vercel Function log.',
      code: failure.providerCode ? String(failure.providerCode) : 'PROVIDER_ERROR',
    }, { status: failure.httpStatus && failure.httpStatus >= 400 && failure.httpStatus < 600 ? failure.httpStatus : 502 });
  }
}
