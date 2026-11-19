import { createHash } from "node:crypto";
import { z } from "zod";
import {
  advertiserIds,
  type ConfirmedCompetitor,
  type ForeplayCandidate,
} from "./library";
type ForeplayAd = Record<string, unknown>;

export type ForeplaySearch = {
  brandIds: string[];
  boardId?: string;
  pageId?: string;
  query?: string;
  limit?: number;
  collect?: boolean;
  force?: boolean;
  boardAdvertisers?: boolean;
  live: "ACTIVE" | "INACTIVE" | "ALL";
  format: "ALL" | "IMAGE" | "VIDEO";
  platform?: "FACEBOOK" | "INSTAGRAM" | "MESSENGER" | "AUDIENCE_NETWORK";
  cursor?: string;
};

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function publicUrl(value: unknown, host?: string): string | undefined {
  const raw = string(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || (host && url.hostname !== host))
      return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export async function searchForeplay(input: ForeplaySearch) {
  const key = process.env.FOREPLAY_API_KEY;
  if (!key) throw new Error("Foreplay API key is not configured");
  let brandIds = input.brandIds;
  let rosterCost = 0;
  const useRoster = Boolean(input.boardId && input.boardAdvertisers);
  if (useRoster) {
    const roster = new URL("https://public.api.foreplay.co/api/board/brands");
    roster.searchParams.set("board_id", input.boardId!);
    roster.searchParams.set("limit", "10");
    const response = await fetch(roster, {
      cache: "no-store",
      headers: { Authorization: key },
    });
    if (!response.ok)
      throw Object.assign(new Error("Foreplay board lookup failed"), {
        httpStatus: response.status,
      });
    const payload = (await response.json()) as { data: { id: string }[] };
    brandIds = payload.data.map((brand) => brand.id).filter(Boolean);
    rosterCost = Number(
      response.headers.get("x-credit-cost") ?? (brandIds.length ? 1 : 0),
    );
    if (!brandIds.length)
      return {
        ads: [],
        after: null,
        source: "Foreplay Brand Ads API" as const,
        retrievedAt: new Date().toISOString(),
        coverageNote:
          "This board has no associated advertisers. Save a competitor ad on the board in Foreplay first.",
        creditCost: rosterCost,
        creditsRemaining: Number(
          response.headers.get("x-credits-remaining") ?? 0,
        ),
      };
  }
  const curated = Boolean(input.boardId && !useRoster);
  const path = curated
    ? "board/ads"
    : input.pageId
      ? "brand/getAdsByPageId"
      : input.query
        ? "discovery/ads"
        : "brand/getAdsByBrandId";
  if (!curated && !input.pageId && !input.query && !brandIds.length)
    throw new Error("Choose an advertiser or search query.");
  const url = new URL("https://public.api.foreplay.co/api/" + path);
  if (curated) url.searchParams.set("board_id", input.boardId!);
  else if (input.pageId) url.searchParams.set("page_id", input.pageId);
  else if (input.query) url.searchParams.set("query", input.query);
  else brandIds.forEach((id) => url.searchParams.append("brand_ids", id));
  url.searchParams.set("limit", String(input.limit || 20));
  url.searchParams.set("order", "newest");
  if (input.live !== "ALL")
    url.searchParams.set("live", String(input.live === "ACTIVE"));
  if (input.format !== "ALL")
    url.searchParams.set("display_format", input.format.toLowerCase());
  if (input.platform)
    url.searchParams.set("publisher_platform", input.platform.toLowerCase());
  if (input.cursor) url.searchParams.set("cursor", input.cursor);

  if (!curated && !input.query) {
    if (input.collect) url.searchParams.set("collect", "true");
    if (input.force) url.searchParams.set("force", "true");
  }
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Authorization: key },
    signal: AbortSignal.timeout(45000),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: ForeplayAd[];
    metadata?: { cursor?: string | number; message?: string };
  };
  if (!response.ok) {
    const failure = new Error("Foreplay search failed") as Error & {
      httpStatus?: number;
    };
    failure.httpStatus = response.status;
    throw failure;
  }
  const ads = Array.isArray(payload.data)
    ? payload.data
        .slice(0, 20)
        .map((ad) => {
          const brand =
            ad.brand && typeof ad.brand === "object"
              ? (ad.brand as ForeplayAd)
              : {};
          const platforms = Array.isArray(ad.publisher_platform)
            ? ad.publisher_platform.map(String)
            : string(ad.publisher_platform)
              ? [String(ad.publisher_platform)]
              : [];
          const body = string(ad.description) || string(ad.headline);
          return {
            id: String(ad.id || ad.ad_id || ""),
            page_name: string(brand.name) || string(ad.brand_name),
            brand_id: string(ad.brand_id) || string(brand.id),
            page_id: input.pageId || string(ad.page_id),
            ad_name: string(ad.name),
            ad_creative_bodies: body ? [body.slice(0, 3000)] : [],
            ad_creative_link_titles: string(ad.headline)
              ? [String(ad.headline)]
              : [],
            ad_creative_link_descriptions: string(ad.cta_title)
              ? [String(ad.cta_title)]
              : [],
            publisher_platforms: platforms,
            ad_delivery_start_time:
              typeof ad.started_running === "number"
                ? new Date(ad.started_running * 1000).toISOString()
                : string(ad.started_running),
            ad_snapshot_url: publicUrl(ad.foreplay_url, "app.foreplay.co"),
            thumbnail_url: publicUrl(ad.thumbnail) || publicUrl(ad.image),
            video_url: publicUrl(ad.video),
            transcript_excerpt: string(ad.full_transcription)?.slice(0, 450),
            display_format: string(ad.display_format),
            live: typeof ad.live === "boolean" ? ad.live : undefined,
          };
        })
        .filter((ad) => ad.id)
    : [];
  return {
    ads,
    after: payload.metadata?.cursor ? String(payload.metadata.cursor) : null,
    source: "Foreplay Brand Ads API" as const,
    retrievedAt: new Date().toISOString(),
    coverageNote:
      (input.force || input.collect
        ? "Live collection requested. It may return partial or empty results. "
        : "") +
      (useRoster
        ? "Indexed ads for up to ten advertisers associated with the linked Foreplay board."
        : curated
          ? "Curated ads saved on the linked Foreplay board, subject to the selected filters."
          : "Foreplay returns ads indexed for the selected brands. Results are not filtered by delivery country; inspect each original ad and do not infer spend or performance."),
    creditCost:
      rosterCost + Number(response.headers.get("x-credit-cost") || ads.length),
    creditsRemaining: Number(response.headers.get("x-credits-remaining") || 0),
  };
}

function brandCandidate(raw: ForeplayAd, domain = ""): ForeplayCandidate {
  const urls = Array.isArray(raw.websites) ? raw.websites : [];
  const sourceUrl = publicUrl(raw.url);
  const sourceHost = sourceUrl ? new URL(sourceUrl).hostname : "";
  const social =
    sourceHost === "facebook.com" || sourceHost.endsWith(".facebook.com");
  const main =
    urls.map((v) => publicUrl(v)).find(Boolean) ||
    (domain ? "https://" + domain : !social ? sourceUrl : undefined);
  const page = string(raw.ad_library_id);
  let resolvedDomain = domain;
  if (
    !resolvedDomain &&
    main &&
    !new URL(main).hostname.endsWith("facebook.com")
  )
    resolvedDomain = new URL(main).hostname.replace(/^www\./, "");
  return {
    id: String(raw.id || ""),
    name: string(raw.name) || "Unnamed advertiser",
    domain: resolvedDomain,
    website: main,
    pageUrl: publicUrl(raw.url),
    brandIds: [String(raw.id || "")],
    pageIds: page && /^\d{3,30}$/.test(page) ? [page] : [],
    adsCount: typeof raw.ads_count === "number" ? raw.ads_count : undefined,
    activeAdsCount:
      typeof raw.active_ads_count === "number"
        ? raw.active_ads_count
        : undefined,
  };
}
export async function findForeplayBrands(
  value: string,
  method: "domain" | "name",
) {
  const key = process.env.FOREPLAY_API_KEY;
  if (!key) throw new Error("Foreplay is unavailable.");
  const url = new URL(
    "https://public.api.foreplay.co/api/" +
      (method === "domain" ? "brand/getBrandsByDomain" : "discovery/brands"),
  );
  url.searchParams.set(method === "domain" ? "domain" : "query", value);
  url.searchParams.set("limit", "8");
  const response = await fetch(url, {
    headers: { Authorization: key },
    cache: "no-store",
    signal: AbortSignal.timeout(45000),
  });
  if (response.status === 404)
    return { candidates: [] as ForeplayCandidate[], creditCost: 0 };
  if (!response.ok)
    throw Object.assign(new Error("Foreplay lookup failed"), {
      httpStatus: response.status,
    });
  const payload = (await response.json()) as { data?: ForeplayAd[] };
  return {
    candidates: (payload.data || [])
      .map((b) => brandCandidate(b, method === "domain" ? value : ""))
      .filter((b) => b.id),
    creditCost: Number(response.headers.get("x-credit-cost") || 1),
  };
}
export async function findForeplayBrandsByDomain(domain: string) {
  return (await findForeplayBrands(domain, "domain")).candidates;
}
export function foreplayError(error: unknown) {
  const status = (error as { httpStatus?: number }).httpStatus;
  const message =
    status === 401
      ? "Foreplay rejected the API key."
      : status === 402
        ? "Foreplay API credits are exhausted."
        : status === 403
          ? "The current Foreplay plan does not allow this lookup."
          : "Foreplay could not complete this lookup. Retry shortly.";
  return { error: message, status: status === 402 ? 402 : 502 };
}
type SearchFilters = Pick<
  ForeplaySearch,
  "live" | "format" | "platform" | "collect" | "force" | "cursor"
>;
const position = z.object({
  cursor: z.string().max(4000).nullable(),
  done: z.boolean(),
});
const cursorSchema = z.object({
  key: z.string(),
  next: z.number().int().min(0),
  positions: z.array(position).max(50),
});
export async function searchSavedCompetitors(
  competitors: ConfirmedCompetitor[],
  input: SearchFilters,
) {
  const targets = competitors
    .filter((c) => c.reviewed === true)
    .flatMap<{ name: string; brandIds: string[]; pageId?: string }>((c) => {
      const { brands, pages } = advertiserIds(c);
      return pages.length
        ? pages.map((pageId) => ({
            name: c.name,
            brandIds: [] as string[],
            pageId,
          }))
        : brands.length
          ? [{ name: c.name, brandIds: brands, pageId: undefined }]
          : [];
    });
  if (!targets.length) throw new Error("Choose a confirmed advertiser.");
  if ((input.force || input.collect) && competitors.length !== 1)
    throw Object.assign(
      new Error("Select one competitor for live collection."),
      { httpStatus: 400 },
    );
  const key = createHash("sha256")
    .update(
      JSON.stringify({
        targets,
        live: input.live,
        format: input.format,
        platform: input.platform,
      }),
    )
    .digest("hex")
    .slice(0, 20);
  let state = {
    key,
    next: 0,
    positions: targets.map(() => ({
      cursor: null as string | null,
      done: false,
    })),
  };
  if (input.cursor) {
    const raw = (() => {
      try {
        return JSON.parse(Buffer.from(input.cursor!, "base64url").toString());
      } catch {
        return null;
      }
    })();
    const parsed = cursorSchema.safeParse(raw);
    if (
      !parsed.success ||
      parsed.data.key !== key ||
      parsed.data.positions.length !== targets.length ||
      parsed.data.next >= targets.length
    )
      throw Object.assign(
        new Error("The advertiser list changed. Start a new search."),
        { httpStatus: 400 },
      );
    state = parsed.data;
  }
  type Result = Awaited<ReturnType<typeof searchForeplay>>;
  const ads: Result["ads"] = [],
    seen = new Set<string>();
  let creditCost = 0,
    creditsRemaining = 0,
    calls = 0,
    visited = 0,
    partial = false;
  const deadline = Date.now() + 220000;
  while (ads.length < 20 && calls < 10 && visited < targets.length) {
    if (Date.now() > deadline) {
      partial = true;
      break;
    }
    const index = state.next;
    state.next = (index + 1) % targets.length;
    visited++;
    const page = state.positions[index];
    if (page.done) continue;
    const active = state.positions.filter((p) => !p.done).length;
    let result: Result;
    try {
      result = await searchForeplay({
        ...input,
        ...targets[index],
        limit: Math.max(1, Math.ceil((20 - ads.length) / Math.max(1, active))),
        cursor: page.cursor || undefined,
        force: !!input.force && !input.cursor,
        collect: !!input.collect && !input.cursor,
      });
    } catch (error) {
      if (!ads.length) throw error;
      state.next = index;
      partial = true;
      break;
    }
    calls++;
    creditCost += result.creditCost;
    creditsRemaining = result.creditsRemaining;
    for (const ad of result.ads)
      if (!seen.has(ad.id)) {
        seen.add(ad.id);
        ads.push({ ...ad, page_name: ad.page_name || targets[index].name });
      }
    if (result.after === page.cursor && result.after) {
      page.done = true;
      partial = true;
      continue;
    }
    page.cursor = result.after;
    page.done = !result.after;
  }
  return {
    ads,
    after: state.positions.some((p) => !p.done)
      ? Buffer.from(JSON.stringify(state)).toString("base64url")
      : null,
    source: "Foreplay Brand Ads API" as const,
    retrievedAt: new Date().toISOString(),
    creditCost,
    creditsRemaining,
    coverageNote:
      (partial
        ? "Some advertiser results were unavailable. Load more to continue remaining Pages. "
        : "") +
      (input.force || input.collect
        ? "Live collection requested. Results may be partial. "
        : "") +
      "Ads indexed for the selected competitors. More advertiser pages can be loaded when available. Foreplay has no delivery-country filter.",
  };
}
