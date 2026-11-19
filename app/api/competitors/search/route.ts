import { NextResponse } from "next/server";
import { z } from "zod";
import { searchMetaAdLibrary } from "../../../../lib/meta/ad-library";
import { verifyAdminSession } from "../../../../lib/auth";
import {
  searchForeplay,
  searchSavedCompetitors,
  foreplayError,
} from "../../../../lib/competitors/foreplay";
import { verifyPaidSourceSession } from "../../../../lib/competitors/access";
import {
  clientExists,
  readClientBoard,
  readCompetitors,
} from "../../../../lib/competitors/store";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  source: z.enum(["meta", "foreplay"]).default("meta"),
  boardAdvertisers: z.boolean().default(false),
  useBoard: z.boolean().default(false),
  mode: z.enum(["library", "keywords", "page"]).default("library"),
  competitorIds: z.array(z.string().max(120)).max(10).optional(),
  refresh: z.boolean().default(false),
  clientId: z.string().max(80).optional(),
  brandIds: z.array(z.string().min(1).max(100)).max(10).default([]),
  searchTerms: z.string().trim().max(100).default(""),
  country: z.string().regex(/^[A-Z]{2}$/),
  activeStatus: z.enum(["ACTIVE", "INACTIVE", "ALL"]).default("ACTIVE"),
  searchType: z
    .enum(["KEYWORD_UNORDERED", "KEYWORD_EXACT_PHRASE"])
    .default("KEYWORD_UNORDERED"),
  mediaType: z.enum(["ALL", "IMAGE", "VIDEO", "MEME", "NONE"]).default("ALL"),
  platform: z
    .enum([
      "FACEBOOK",
      "INSTAGRAM",
      "AUDIENCE_NETWORK",
      "MESSENGER",
      "WHATSAPP",
      "THREADS",
    ])
    .optional(),
  pageIds: z
    .array(z.string().regex(/^\d{3,30}$/))
    .max(10)
    .default([]),
  after: z.string().max(64000).optional(),
});

export async function GET() {
  const signedIn = await verifyPaidSourceSession();
  return NextResponse.json(
    {
      sources: {
        meta: {
          configured: Boolean(process.env.META_AD_LIBRARY_TOKEN),
          ready: Boolean(process.env.META_AD_LIBRARY_TOKEN),
        },
        foreplay: {
          configured: Boolean(process.env.FOREPLAY_API_KEY),
          ready: Boolean(process.env.FOREPLAY_API_KEY && signedIn),
          signedIn,
          authConfigured: Boolean(
            process.env.GOOGLE_CLIENT_ID &&
              process.env.GOOGLE_CLIENT_SECRET &&
              process.env.NEXTAUTH_SECRET &&
              process.env.AUTH_ALLOWED_EMAILS,
          ),
        },
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function POST(request: Request) {
  if (!(await verifyAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid search" },
      { status: 400 },
    );
  if (parsed.data.source === "foreplay") {
    if (!(await verifyPaidSourceSession()))
      return NextResponse.json(
        {
          error: "Sign in with an approved Google account to search Foreplay.",
          code: "SIGN_IN_REQUIRED",
        },
        { status: 403 },
      );
    if (!process.env.FOREPLAY_API_KEY)
      return NextResponse.json(
        {
          error: "Add FOREPLAY_API_KEY in Vercel to enable Foreplay search.",
          code: "SOURCE_NOT_CONFIGURED",
        },
        { status: 503 },
      );
    try {
      const data = parsed.data;
      if (!data.clientId || !(await clientExists(data.clientId)))
        return NextResponse.json(
          { error: "Choose a client brand." },
          { status: 400 },
        );
      if (data.refresh && (data.mode === "keywords" || data.useBoard))
        return NextResponse.json(
          { error: "Live collection requires a selected advertiser or Page." },
          { status: 400 },
        );
      const filters = {
        live: data.activeStatus,
        format:
          data.mediaType === "IMAGE" || data.mediaType === "VIDEO"
            ? data.mediaType
            : ("ALL" as const),
        platform:
          data.platform === "FACEBOOK" ||
          data.platform === "INSTAGRAM" ||
          data.platform === "MESSENGER" ||
          data.platform === "AUDIENCE_NETWORK"
            ? data.platform
            : undefined,
        cursor: data.after,
        force: data.refresh && !data.after,
        collect: data.refresh && !data.after,
      };
      let result;
      if (data.mode === "keywords") {
        if (!data.searchTerms.trim())
          return NextResponse.json(
            { error: "Enter a product or keyword." },
            { status: 400 },
          );
        result = await searchForeplay({
          ...filters,
          brandIds: [],
          query: data.searchTerms,
        });
      } else if (data.mode === "page") {
        if (data.pageIds.length !== 1)
          return NextResponse.json(
            { error: "Enter one numeric Facebook Page ID." },
            { status: 400 },
          );
        result = await searchForeplay({
          ...filters,
          brandIds: [],
          pageId: data.pageIds[0],
        });
      } else if (data.useBoard) {
        const board = await readClientBoard(data.clientId);
        if (!board)
          return NextResponse.json(
            { error: "Link a board for this client first." },
            { status: 400 },
          );
        result = await searchForeplay({
          ...filters,
          brandIds: [],
          boardId: board.id,
          boardAdvertisers: data.boardAdvertisers,
        });
      } else {
        const saved = (await readCompetitors(data.clientId)).filter(
          (c) => c.reviewed === true,
        );
        const selected = data.competitorIds
          ? saved.filter((c) => data.competitorIds!.includes(c.id))
          : data.brandIds.length
            ? saved.filter((c) => data.brandIds.includes(c.id))
            : saved;
        if (
          !selected.length ||
          data.competitorIds?.some(
            (id) => !selected.some((c) => c.id === id),
          ) ||
          data.brandIds.some((id) => !saved.some((c) => c.id === id))
        )
          return NextResponse.json(
            {
              error: "Choose confirmed competitors from this client’s library.",
            },
            { status: 400 },
          );
        result = await searchSavedCompetitors(selected, filters);
      }
      return NextResponse.json(result, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (error) {
      if ((error as { httpStatus?: number }).httpStatus === 400)
        return NextResponse.json(
          { error: (error as Error).message },
          { status: 400 },
        );
      const failure = foreplayError(error);
      return NextResponse.json(
        { error: failure.error, code: "PROVIDER_ERROR" },
        { status: failure.status },
      );
    }
  }
  if (!parsed.data.searchTerms.trim() && !parsed.data.pageIds.length)
    return NextResponse.json(
      { error: "Enter Meta search terms or Page IDs." },
      { status: 400 },
    );
  if (!process.env.META_AD_LIBRARY_TOKEN) {
    return NextResponse.json(
      {
        error:
          "Meta Ad Library API is not connected. Add META_AD_LIBRARY_TOKEN after enabling API access for the Tossdown Meta developer app.",
        code: "SOURCE_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }

  try {
    const result = await searchMetaAdLibrary(parsed.data);
    return NextResponse.json(
      {
        ...result,
        coverageNote:
          "Meta’s API returns general commercial ads delivered in the UK/EU within the documented window. Outside those regions, API results cover political/issue ads only. This source does not provide normal competitor spend or conversion performance.",
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    const failure = error as {
      providerCode?: number;
      providerSubcode?: number;
      httpStatus?: number;
      message?: string;
    };
    console.error("Meta Ad Library search failed", {
      providerCode: failure.providerCode,
      providerSubcode: failure.providerSubcode,
      httpStatus: failure.httpStatus,
    });
    return NextResponse.json(
      {
        error:
          "Meta Ad Library search failed. Check API access, query coverage, and the Vercel Function log.",
        code: failure.providerCode
          ? String(failure.providerCode)
          : "PROVIDER_ERROR",
      },
      {
        status:
          failure.httpStatus &&
          failure.httpStatus >= 400 &&
          failure.httpStatus < 600
            ? failure.httpStatus
            : 502,
      },
    );
  }
}
