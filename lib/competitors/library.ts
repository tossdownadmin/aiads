import { z } from "zod";

export const clientIdSchema = z.string().regex(/^[a-z0-9-]{1,80}$/);
export const pageIdSchema = z.string().regex(/^\d{3,30}$/);
const brandId = z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/);
const web = z
  .string()
  .url()
  .refine(
    (value) => new URL(value).protocol === "https:",
    "Use an HTTPS website.",
  );
export const competitorSchema = z.object({
  id: brandId,
  name: z.string().trim().min(1).max(200),
  domain: z.string().trim().max(200).default(""),
  website: web.optional(),
  pageUrl: web.optional(),
  brandIds: z.array(brandId).max(5).optional(),
  pageIds: z.array(pageIdSchema).max(5).optional(),
  market: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
  reviewed: z.literal(true).optional(),
});
export const savedSearchSchema = z.object({
  id: brandId,
  name: z.string().trim().min(1).max(100),
  query: z.string().trim().min(1).max(100),
});
export type ConfirmedCompetitor = z.infer<typeof competitorSchema>;
export type SavedSearch = z.infer<typeof savedSearchSchema>;
export type Library = {
  competitors: ConfirmedCompetitor[];
  searches: SavedSearch[];
  reviewedBy?: string;
  reviewedAt?: string;
};

export function advertiserIds(competitor: ConfirmedCompetitor) {
  const pages = [...new Set(competitor.pageIds || [])];
  const brands = [
    ...new Set(competitor.brandIds ?? (pages.length ? [] : [competitor.id])),
  ];
  return { brands, pages };
}
export const librarySchema = z
  .object({
    competitors: z.array(competitorSchema).max(10),
    searches: z.array(savedSearchSchema).max(20).default([]),
  })
  .superRefine((value, ctx) => {
    const rows = new Set<string>(),
      identities = new Set<string>(),
      queries = new Set<string>();
    for (const competitor of value.competitors) {
      const { brands, pages } = advertiserIds(competitor);
      if (!brands.length && !pages.length)
        ctx.addIssue({
          code: "custom",
          message:
            "A competitor needs a Foreplay brand ID or Facebook Page ID.",
        });
      const keys = [
        ...brands.map((id) => "brand:" + id),
        ...pages.map((id) => "page:" + id),
      ];
      if (rows.has(competitor.id) || keys.some((id) => identities.has(id)))
        ctx.addIssue({
          code: "custom",
          message:
            "An advertiser is already assigned to another competitor in this client list.",
        });
      rows.add(competitor.id);
      keys.forEach((id) => identities.add(id));
    }
    for (const search of value.searches) {
      if (queries.has(search.id))
        ctx.addIssue({
          code: "custom",
          message: "Saved searches must have unique IDs.",
        });
      queries.add(search.id);
    }
  });
export type ForeplayCandidate = {
  id: string;
  name: string;
  domain: string;
  website?: string;
  pageUrl?: string;
  brandIds: string[];
  pageIds: string[];
  adsCount?: number;
  activeAdsCount?: number;
};

export type ResearchAd = {
  id: string;
  page_name?: string;
  page_id?: string;
  brand_id?: string;
  ad_name?: string;
  ad_creation_time?: string;
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_creative_link_descriptions?: string[];
  ad_creative_link_captions?: string[];
  ad_snapshot_url?: string;
  publisher_platforms?: string[];
  thumbnail_url?: string;
  video_url?: string;
};
export type ResearchResult = {
  ads: ResearchAd[];
  after: string | null;
  source: string;
  retrievedAt: string;
  coverageNote: string;
  creditCost?: number;
  creditsRemaining?: number;
};
